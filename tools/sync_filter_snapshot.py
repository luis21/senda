"""Validate a prepared snapshot before copying its fixed files into Chromium."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def write_if_changed(path, data):
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)

def verify_snapshot(directory):
    directory = Path(directory)
    manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    data = (directory/'UnindexedRules').read_bytes()
    if manifest.get('schema') not in (1, 2) or manifest.get('format') != 'chromium-unindexed-ruleset':
        raise ValueError('Unsupported snapshot schema')
    if not 1024 <= len(data) <= 20*1024*1024 or manifest.get('bytes') != len(data):
        raise ValueError('Snapshot size mismatch')
    if manifest.get('sha256') != hashlib.sha256(data).hexdigest():
        raise ValueError('Snapshot checksum mismatch')
    if manifest.get('license') != 'CC-BY-SA-3.0' or not (directory/'LICENSE').is_file():
        raise ValueError('Missing snapshot license')
    if manifest['schema'] == 2:
        if manifest.get('cosmetic_exceptions', {}).get('storage') != 'ruleset-proto-field-3':
            raise ValueError('Missing embedded cosmetic exception contract')
    elif 'cosmetic_exceptions' in manifest:
        metadata = manifest['cosmetic_exceptions']
        header = (directory/'CosmeticExceptions.inc').read_bytes()
        if not 0 < len(header) <= 1024*1024 or metadata.get('bytes') != len(header) or metadata.get('sha256') != hashlib.sha256(header).hexdigest():
            raise ValueError('Cosmetic exception checksum or size mismatch')
    return manifest

def sync_snapshot(directory, chromium_root):
    manifest = verify_snapshot(directory)
    target = Path(chromium_root)/'third_party/senda_filter_lists'
    target.mkdir(parents=True, exist_ok=True)
    names = ['UnindexedRules', 'LICENSE', 'manifest.json']
    if manifest['schema'] == 1 and 'cosmetic_exceptions' in manifest:
        names.append('CosmeticExceptions.inc')
    for name in names:
        write_if_changed(target/name, (Path(directory)/name).read_bytes())
    # Immutable fallback metadata is compiled once. Downloaded list updates
    # never generate or execute C++; their exceptions remain in the ruleset.
    versions = [item.get('version', '') for item in manifest['sources']]
    if len(versions) == 2 and all(re.fullmatch(r'[0-9]{12}', v) for v in versions):
        license_text = (Path(directory)/'LICENSE').read_text(encoding='utf-8')
        if not license_text or '\0' in license_text or len(license_text.encode('utf-8')) > 128*1024:
            raise ValueError('Invalid bundled license')
        header = ('// Generated from the verified bundled snapshot; not a download artifact.\n'
                  '#include <array>\n#include <string_view>\nnamespace subresource_filter {\n'
                  'inline constexpr std::array<std::string_view, 2> kSendaBundledVersions = {'+
                  ','.join(json.dumps(v) for v in versions)+'};\n'
                  'inline constexpr std::string_view kSendaBundledLicense = '+json.dumps(license_text)+';\n'
                  '}\n')
        write_if_changed(target/'BundledMetadata.inc', header.encode('utf-8'))
    versions = ', '.join(item['version'] for item in manifest['sources'])
    readme = (
        'Name: EasyList and EasyPrivacy\nShort Name: senda_filter_lists\nURL: https://easylist.to/\n'
        'Version: '+versions+'\nLicense: CC-BY-SA-3.0\nLicense File: LICENSE\nSecurity Critical: yes\nShipped: yes\n\n'
        'Description:\nSupported network URL and cosmetic CSS rules for the Senda native blocker.\n\n'
        'Local Modifications:\nConverted with Chromium ruleset_converter; negative CSS domains become explicit exceptions and unsupported syntax is omitted.\n')
    write_if_changed(target/'README.chromium',readme.encode('utf-8'))
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT/'assets/filters')
    parser.add_argument('--chromium-root', type=Path, default=ROOT/'.chromium/src')
    args = parser.parse_args()
    result = sync_snapshot(args.source, args.chromium_root)
    print('Validated and copied', result['network_rules'], 'network rules; SHA-256', result['sha256'])
