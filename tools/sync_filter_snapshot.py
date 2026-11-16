"""Validate a prepared snapshot before copying its fixed files into Chromium."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def verify_snapshot(directory):
    directory = Path(directory)
    manifest = json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    data = (directory/'UnindexedRules').read_bytes()
    if manifest.get('schema') != 1 or manifest.get('format') != 'chromium-unindexed-ruleset':
        raise ValueError('Unsupported snapshot schema')
    if not 1024 <= len(data) <= 20*1024*1024 or manifest.get('bytes') != len(data):
        raise ValueError('Snapshot size mismatch')
    if manifest.get('sha256') != hashlib.sha256(data).hexdigest():
        raise ValueError('Snapshot checksum mismatch')
    if manifest.get('license') != 'CC-BY-SA-3.0' or not (directory/'LICENSE').is_file():
        raise ValueError('Missing snapshot license')
    return manifest

def sync_snapshot(directory, chromium_root):
    manifest = verify_snapshot(directory)
    target = Path(chromium_root)/'third_party/senda_filter_lists'
    target.mkdir(parents=True, exist_ok=True)
    for name in ('UnindexedRules', 'LICENSE', 'manifest.json'):
        shutil.copyfile(Path(directory)/name, target/name)
    versions = ', '.join(item['version'] for item in manifest['sources'])
    (target/'README.chromium').write_text(
        'Name: EasyList and EasyPrivacy\nShort Name: senda_filter_lists\nURL: https://easylist.to/\n'
        'Version: '+versions+'\nLicense: CC-BY-SA-3.0\nLicense File: LICENSE\nSecurity Critical: yes\nShipped: yes\n\n'
        'Description:\nSupported network URL rules for the Senda native blocker.\n\n'
        'Local Modifications:\nConverted with Chromium ruleset_converter; unsupported and cosmetic rules are not activated.\n', encoding='utf-8')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT/'assets/filters')
    parser.add_argument('--chromium-root', type=Path, default=ROOT/'.chromium/src')
    args = parser.parse_args()
    result = sync_snapshot(args.source, args.chromium_root)
    print('Validated and copied', result['network_rules'], 'network rules; SHA-256', result['sha256'])
