"""Compile attributed EasyList sources using Chromium's own rule converter."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def validate_source(raw, title):
    if not 1024 <= len(raw) <= 20 * 1024 * 1024:
        raise ValueError('Filter source size outside accepted limits')
    text = raw.decode('utf-8-sig')
    if not text.startswith('[Adblock Plus '):
        raise ValueError('Not an Adblock filter list')
    header = text.splitlines()[:20]
    if '! Title: ' + title not in header:
        raise ValueError('Unexpected filter list title')
    versions = [line.removeprefix('! Version: ') for line in header if line.startswith('! Version: ')]
    if len(versions) != 1 or not re.fullmatch(r'\d{12}', versions[0]):
        raise ValueError('Invalid source version')
    datetime.datetime.strptime(versions[0], '%Y%m%d%H%M')
    rules = sum(1 for line in text.splitlines() if line.strip() and not line.startswith(('!', '[')))
    if rules < 100:
        raise ValueError('Filter list unexpectedly empty')
    return {'title': title, 'version': versions[0], 'sha256': hashlib.sha256(raw).hexdigest(), 'source_rules': rules}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--converter', type=Path, default=ROOT/'.chromium/src/out/SendaDev/ruleset_converter.exe')
    args = parser.parse_args()
    sources = [(ROOT/'third_party/easylist/easylist.txt', 'EasyList', 'https://easylist.to/easylist/easylist.txt'),
               (ROOT/'third_party/easylist/easyprivacy.txt', 'EasyPrivacy', 'https://easylist.to/easylist/easyprivacy.txt')]
    provenance = [dict(validate_source(path.read_bytes(), title), url=url) for path, title, url in sources]
    bundle = ROOT/'assets/filters'
    bundle.mkdir(parents=True, exist_ok=True)
    logs = ROOT/'.tools'
    logs.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='senda-filters-') as temporary:
        temporary = Path(temporary)
        network, cosmetic, binary = [temporary/name for name in ('network.txt', 'cosmetic.txt', 'UnindexedRules')]
        def convert(arguments):
            result = subprocess.run([str(args.converter), *arguments], capture_output=True, timeout=120)
            with (logs/'filter-conversion.log').open('ab') as log:
                log.write(result.stdout + result.stderr)
            if result.returncode:
                raise RuntimeError('Native converter failed; previous snapshot preserved')
        convert(['--input_format=filter-list', '--output_format=filter-list', '--chrome_version=59',
                 '--input_files='+','.join(str(path) for path, _, _ in sources), '--output_file_url='+str(network), '--output_file_css='+str(cosmetic)])
        network_count = len(network.read_text(encoding='utf-8').splitlines())
        cosmetic_count = len(cosmetic.read_text(encoding='utf-8').splitlines())
        if network_count < 1000:
            raise ValueError('Too few supported network rules; previous snapshot preserved')
        convert(['--input_format=filter-list', '--output_format=unindexed-ruleset', '--chrome_version=59',
                 '--input_files='+str(network), '--output_file_url='+str(binary)])
        data = binary.read_bytes()
        if not 1024 <= len(data) <= 20*1024*1024:
            raise ValueError('Unexpected converted size; previous snapshot preserved')
        manifest = {'schema': 1, 'format': 'chromium-unindexed-ruleset', 'sources': provenance,
                    'network_rules': network_count, 'cosmetic_rules_parsed_but_not_activated': cosmetic_count,
                    'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                    'license': 'CC-BY-SA-3.0', 'authors': 'The EasyList authors (https://easylist.to/)',
                    'changes': 'Converted supported URL rules with Chromium. Unsupported rules are omitted; cosmetic rules are not activated.'}
        license_text = 'EasyList and EasyPrivacy\nThe EasyList authors (https://easylist.to/)\n\nChanges: '+manifest['changes']+'\n\n'
        license_text += (ROOT/'third_party/easylist/LICENSE-CC-BY-SA-3.0.txt').read_text(encoding='utf-8')
        for name, content in [('UnindexedRules', data), ('LICENSE', license_text.encode()),
                              ('manifest.json', (json.dumps(manifest, indent=2)+'\n').encode())]:
            staged = bundle/(name+'.tmp')
            staged.write_bytes(content)
            staged.replace(bundle/name)
        (logs/'supported-network-rules.txt').write_bytes(network.read_bytes())
        (logs/'parsed-cosmetic-rules-not-active.txt').write_bytes(cosmetic.read_bytes())
        print(json.dumps({'network_rules': network_count, 'cosmetic_not_active': cosmetic_count, 'bytes': len(data), 'sha256':manifest['sha256']}))

if __name__ == '__main__':
    main()
