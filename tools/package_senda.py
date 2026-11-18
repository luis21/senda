"""Validate Senda build inputs before generating a Windows installer."""
import hashlib
import json
from pathlib import Path
import re

SYMBOL_SUFFIXES = {'.pdb', '.lib', '.exp', '.ilk', '.obj'}
DEBUG_RUNTIME = re.compile(
    r'^(?:msvcp\d+d(?:_.*)?|vcruntime\d+(?:_\d+)?d|vccorlib\d+d|'
    r'ucrtbased|concrt\d+d|mfcm?\d+.*d)\.dll$', re.IGNORECASE)


def nsis_escape(value):
    if any(c in value for c in '\r\n\0'):
        raise ValueError('Control characters cannot appear in NSIS literals')
    return value.replace('$', '$$').replace('"', '$\\"')


def file_hash(file):
    digest = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def collect_payload(output_dir, runtime_deps, allow_debug=False):
    root = Path(output_dir).resolve(strict=True)
    selected = {}

    def add(file):
        file = Path(file)
        if file.suffix.lower() in SYMBOL_SUFFIXES:
            return
        resolved = file.resolve(strict=True)
        if resolved == root or not resolved.is_relative_to(root):
            raise ValueError(f'Runtime dependency escapes the output directory: {file}')
        relative = resolved.relative_to(root)
        if any(part.casefold() in {'user data', '.profiles', 'profiles'} for part in relative.parts):
            raise ValueError('User profiles cannot be packaged')
        if resolved.is_dir():
            for child in sorted(resolved.iterdir()):
                add(child)
            return
        if not resolved.is_file():
            raise ValueError(f'Not a regular runtime file: {file}')
        if DEBUG_RUNTIME.fullmatch(resolved.name) and not allow_debug:
            raise ValueError(f'Debug CRT is not redistributable: {resolved.name}')
        key = relative.as_posix().casefold()
        if key in selected:
            if selected[key]['source'] != str(resolved):
                raise ValueError('Case-insensitive destination collision')
            return
        selected[key] = {'relative': relative.as_posix(), 'source': str(resolved),
                         'size': resolved.stat().st_size, 'sha256': file_hash(resolved)}

    for name in runtime_deps:
        if not isinstance(name, str) or not name or Path(name).is_absolute():
            raise ValueError('Expected a relative GN runtime dependency')
        add(root / name)
    return sorted(selected.values(), key=lambda item: item['relative'].casefold())


def validate_build(output_dir, project_root, allow_debug=False):
    output, project = Path(output_dir), Path(project_root)
    stamp = json.loads((output / '.senda-build.json').read_text(encoding='utf-8-sig'))
    chromium = json.loads((project / 'config/chromium.json').read_text(encoding='utf-8-sig'))
    if stamp.get('status') != 'success' or stamp.get('revision') != chromium['revision']:
        raise ValueError('Missing successful build for the pinned Chromium revision')
    args = (output / 'args.gn').read_text(encoding='utf-8-sig')
    debug = re.search(r'^\s*is_debug\s*=\s*(true|false)\s*(?:#.*)?$', args, re.MULTILINE)
    cpu = re.search(r'^\s*target_cpu\s*=\s*"x64"\s*(?:#.*)?$', args, re.MULTILINE)
    if not debug or not cpu:
        raise ValueError('Explicit Windows x64 build arguments are required')
    if not allow_debug and (debug.group(1) != 'false' or stamp.get('configuration') != 'Release'):
        raise ValueError('A Release build is required for distribution')
    for line in (project / 'patches/series').read_text(encoding='utf-8').splitlines():
        name = line.strip()
        if not name:
            continue
        if Path(name).name != name or name in {'.', '..'}:
            raise ValueError('Invalid patch name')
        expected = stamp.get('patches', {}).get(name, '').lower()
        if expected != file_hash(project / 'patches' / name):
            raise ValueError(f'Build does not contain the current patch: {name}')
    return stamp
