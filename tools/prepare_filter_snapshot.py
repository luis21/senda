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

def prepare_cosmetic_exceptions(source_texts):
    """Preserve activation exceptions omitted by the legacy URL converter.

    URL paths and options may narrow a rule; applying its exception to the
    entire host is conservative. Unknown patterns disable the corresponding
    cosmetic category rather than risk hiding legitimate content.
    """
    result = {key: set() for key in ('generic_domains', 'all_domains', 'generic_prefixes',
              'all_prefixes', 'generic_url_substrings', 'all_url_substrings')}
    result.update(disable_all_generic=False, disable_all_cosmetic=False, source_rules=0, fallback_rules=0)
    for text in source_texts:
        for line in text.splitlines():
            if not line.startswith('@@') or '$' not in line:
                continue
            pattern, options = line[2:].rsplit('$', 1)
            options = options.lower().split(',')
            names = {option.lstrip('~') for option in options}
            if names & {'elemhide', 'ehide', 'specifichide', 'shide'}:
                category = 'all'
            elif names & {'generichide', 'ghide'}:
                category = 'generic'
            else:
                continue
            result['source_rules'] += 1
            covered = False
            if pattern.startswith('||'):
                host = re.split(r'[\^/:?]', pattern[2:], 1)[0].lower()
                rest = pattern[2+len(host):]
                if re.fullmatch(r'[a-z0-9_.-]+', host) and rest:
                    result[category+'_domains'].add(host)
                    covered = True
                elif re.fullmatch(r'[a-z0-9_.-]+\*?', host):
                    result[category+'_prefixes'].add(host.rstrip('*'))
                    covered = True
            elif re.fullmatch(r'://[a-zA-Z0-9_.:/-]+', pattern):
                # These rules are substring patterns, including inside a URL
                # path. Keeping the literal also covers private IP prefixes.
                result[category+'_url_substrings'].add(pattern)
                covered = True
            elif not pattern:
                domain_options = [o[7:] for o in options if o.startswith('domain=')]
                if len(domain_options) == 1:
                    domains = [d for d in domain_options[0].split('|') if not d.startswith('~')]
                    if domains and all(re.fullmatch(r'[a-z0-9_.-]+', d) for d in domains):
                        result[category+'_domains'].update(domains)
                        covered = True
            if not covered:
                result['disable_all_cosmetic' if category == 'all' else 'disable_all_generic'] = True
                result['fallback_rules'] += 1
    return {key: sorted(value) if isinstance(value, set) else value for key, value in result.items()}

def encode_cosmetic_exception_chunk(exceptions):
    """Serialize FilteringRules.cosmetic_exceptions (rules.proto field 3).

    Development packaging does not require generated Python protobuf bindings.
    Native round-trip tests pin this small wire-format adapter to rules.proto.
    The entire chunk is covered by the ruleset content hash.
    """
    def varint(value):
        output = bytearray()
        while value >= 128:
            output.append((value & 127) | 128)
            value >>= 7
        output.append(value)
        return bytes(output)

    fields = ('generic_domains', 'all_domains', 'generic_prefixes',
              'all_prefixes', 'generic_url_substrings', 'all_url_substrings')
    payload = bytearray()
    for field, name in enumerate(fields, 1):
        for value in exceptions[name]:
            encoded = value.encode('utf-8')
            payload.extend(varint((field << 3) | 2) + varint(len(encoded)) + encoded)
    for field, name in ((7, 'disable_all_generic'), (8, 'disable_all_cosmetic')):
        if exceptions[name]:
            payload.extend(varint(field << 3) + b'\x01')
    chunk = b'\x1a' + varint(len(payload)) + payload
    return varint(len(chunk)) + chunk


def render_cosmetic_exceptions(exceptions):
    text = ('// Derived from EasyList/EasyPrivacy by the Senda filter compiler.\n'
            '// The EasyList authors, CC-BY-SA-3.0; see the accompanying LICENSE.\n'
            '// Paths/options are widened conservatively; unknown rules disable hiding.\n')
    names = {'generic_domains': 'GenericCosmeticDomains', 'all_domains': 'AllCosmeticDomains',
             'generic_prefixes': 'GenericCosmeticHostPrefixes', 'all_prefixes': 'AllCosmeticHostPrefixes',
             'generic_url_substrings': 'GenericCosmeticUrlSubstrings', 'all_url_substrings': 'AllCosmeticUrlSubstrings'}
    for key, name in names.items():
        text += f'constexpr std::array<std::string_view, {len(exceptions[key])}> kSenda{name} = {{\n'
        text += ''.join('    '+json.dumps(value)+',\n' for value in exceptions[key]) + '};\n'
    for key, name in [('disable_all_generic', 'DisableAllGenericCosmetic'), ('disable_all_cosmetic', 'DisableAllCosmetic')]:
        text += 'constexpr bool kSenda'+name+' = '+str(exceptions[key]).lower()+';\n'
    return text.encode('utf-8')

def prepare_cosmetic_rules(text):
    """Normalize canonical CSS rules for Chromium's domain/class/ID index.

    The converter has already rejected unsupported selector grammars. Negative
    hiding domains become explicit exceptions. An unsupported exception drops
    every hiding rule for that selector, preferring underblocking to breakage.
    Site rules must precede generic rules to preserve exception indices.
    """
    parsed = []
    unsafe = set()
    omitted = 0
    for line in text.splitlines():
        marker = '#@#' if '#@#' in line else '##'
        if marker not in line:
            omitted += 1
            continue
        domain_text, selector = line.split(marker, 1)
        domains = domain_text.split(',') if domain_text else []
        valid_domains = all(re.fullmatch(r'~?[a-zA-Z0-9_.-]+', d) for d in domains)
        valid_selector = (selector and selector.isascii() and
                          not any(c in selector for c in ('{', '}', '/*', '*/', '@', ':style(', ':-abp-', ':has-text(', ':matches-css(')))
        invalid_exception = marker == '#@#' and (not domains or any(d.startswith('~') for d in domains))
        if not valid_domains or not valid_selector or invalid_exception:
            if marker == '#@#':
                unsafe.add(selector)
            omitted += 1
            continue
        parsed.append((domains, marker, selector))
    rules = set()
    for domains, marker, selector in parsed:
        if selector in unsafe:
            omitted += 1
            continue
        if marker == '#@#':
            rules.add(','.join(domains) + marker + selector)
            continue
        positive = [d for d in domains if not d.startswith('~')]
        rules.add(','.join(positive) + '##' + selector)
        for domain in domains:
            if domain.startswith('~'):
                rules.add(domain[1:] + '#@#' + selector)
    ordered = sorted(rules, key=lambda rule: (rule.startswith('##'), rule))
    return ordered, {'parsed': len(text.splitlines()), 'compiled': len(ordered), 'omitted': omitted}

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
    exceptions = prepare_cosmetic_exceptions([path.read_text(encoding='utf-8-sig') for path, _, _ in sources])
    exception_chunk = encode_cosmetic_exception_chunk(exceptions)
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
        cosmetic_rules, cosmetic_stats = prepare_cosmetic_rules(cosmetic.read_text(encoding='utf-8'))
        supported_cosmetic = temporary/'supported-cosmetic.txt'
        supported_cosmetic.write_text('\n'.join(cosmetic_rules)+'\n', encoding='utf-8')
        if network_count < 1000:
            raise ValueError('Too few supported network rules; previous snapshot preserved')
        convert(['--input_format=filter-list', '--output_format=unindexed-ruleset', '--chrome_version=59',
                 '--input_files='+str(supported_cosmetic)+','+str(network), '--output_file='+str(binary)])
        data = binary.read_bytes() + exception_chunk
        if not 1024 <= len(data) <= 20*1024*1024:
            raise ValueError('Unexpected converted size; previous snapshot preserved')
        manifest = {'schema': 2, 'format': 'chromium-unindexed-ruleset', 'sources': provenance,
                    'network_rules': network_count, 'cosmetic_rules': cosmetic_stats,
                    'cosmetic_exceptions': dict(
                        {key: len(value) if isinstance(value, list) else value for key, value in exceptions.items()},
                        storage='ruleset-proto-field-3'),
                    'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                    'license': 'CC-BY-SA-3.0', 'authors': 'The EasyList authors (https://easylist.to/)',
                    'changes': 'Converted supported URL and CSS rules with Chromium. Negative CSS domains become explicit exceptions. Cosmetic activation exceptions are preserved conservatively; unsupported hiding syntax is omitted.'}
        license_text = 'EasyList and EasyPrivacy\nThe EasyList authors (https://easylist.to/)\n\nChanges: '+manifest['changes']+'\n\n'
        license_text += (ROOT/'third_party/easylist/LICENSE-CC-BY-SA-3.0.txt').read_text(encoding='utf-8')
        for name, content in [('UnindexedRules', data), ('LICENSE', license_text.encode()),
                              ('manifest.json', (json.dumps(manifest, indent=2)+'\n').encode())]:
            staged = bundle/(name+'.tmp')
            staged.write_bytes(content)
            staged.replace(bundle/name)
        (logs/'supported-network-rules.txt').write_bytes(network.read_bytes())
        (logs/'supported-cosmetic-rules.txt').write_bytes(supported_cosmetic.read_bytes())
        print(json.dumps({'network_rules': network_count, 'cosmetic_rules': cosmetic_stats, 'bytes': len(data), 'sha256':manifest['sha256']}))

if __name__ == '__main__':
    main()
