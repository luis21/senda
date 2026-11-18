"""Validate Senda build inputs before generating a Windows installer."""
import hashlib
import json
from pathlib import Path
import re
from pathlib import PurePosixPath

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
    visited_directories = set()

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
            if resolved in visited_directories:
                return
            visited_directories.add(resolved)
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


def write_package_files(files, destination, metadata):
    """Generate explicit NSIS instructions; never emit recursive deletion."""
    directories, names = set(), set()
    install, remove, locks = [], [], []
    public = []
    for item in files:
        name = item['relative']
        parts = name.split('/')
        if (not name or any(part in {'', '.', '..'} for part in parts)
                or any(c in name for c in '\\:"<>|?*') or any(ord(c) < 32 for c in name)
                or any(part.endswith((' ', '.')) for part in parts)
                or any(re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.I) for part in parts)):
            raise ValueError(f'Unsafe Windows payload destination: {name!r}')
        if name.casefold() in names:
            raise ValueError('Duplicate payload destination')
        names.add(name.casefold())
        relative = PurePosixPath(name)
        parent = relative.parent
        while str(parent) != '.':
            directories.add(str(parent))
            parent = parent.parent
        target = nsis_escape(name.replace('/', '\\'))
        directory = nsis_escape(str(relative.parent).replace('/', '\\'))
        install.append('SetOutPath "$INSTDIR' + ('' if directory == '.' else '\\' + directory) + '"')
        install.append(f'File "/oname={nsis_escape(relative.name)}" "{nsis_escape(item["source"])}"')
        remove.append(f'Delete "$INSTDIR\\{target}"')
        locks.append(f'!insertmacro CheckUnlocked "$INSTDIR\\{target}"')
        public.append({k: item[k] for k in ('relative', 'size', 'sha256')})
    for directory in sorted(directories, key=lambda d: (-d.count('/'), d)):
        remove.append('RMDir "$INSTDIR\\' + nsis_escape(directory.replace('/', '\\')) + '"')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for name, lines in [('payload-install.nsh', install), ('payload-remove.nsh', remove),
                        ('payload-locks.nsh', locks)]:
        (destination / name).write_text('\n'.join(lines) + '\n', encoding='utf-8-sig')
    (destination / 'package-manifest.json').write_text(
        json.dumps({**metadata, 'files': public}, indent=2) + '\n', encoding='utf-8')


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--runtime-deps', type=Path, required=True)
    parser.add_argument('--generated', type=Path, required=True)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--personal-dev', action='store_true', help='Debug build for the owner PC only; not redistributable')
    args = parser.parse_args()
    stamp = validate_build(args.output, args.project, allow_debug=args.personal_dev)
    deps = json.loads(args.runtime_deps.read_text(encoding='utf-8-sig'))['//chrome:chrome']['runtime_deps']
    files = collect_payload(args.output, deps, allow_debug=args.personal_dev)
    if not any(item['relative'].casefold() == 'chrome.exe' for item in files):
        raise ValueError('GN payload is missing chrome.exe')
    # Retain chrome.exe for upstream subprocess paths and expose Senda.exe to users.
    files = [item for item in files if item['relative'].casefold() != 'senda.exe']
    chrome = next(item for item in files if item['relative'].casefold() == 'chrome.exe')
    files.append({**chrome, 'relative': 'Senda.exe'})
    for relative, source in [
            ('licenses/Senda-LICENSE.txt', args.project / 'LICENSE'),
            ('licenses/Chromium-LICENSE.txt', args.project / '.chromium/src/LICENSE'),
            ('licenses/Filter-lists-LICENSE.txt', args.project / 'assets/filters/LICENSE')]:
        files.append({'relative': relative, 'source': str(source.resolve(strict=True)),
                      'size': source.stat().st_size, 'sha256': file_hash(source)})
    chromium = json.loads((args.project / 'config/chromium.json').read_text(encoding='utf-8-sig'))
    import subprocess
    commit = subprocess.check_output(['git', '-C', str(args.project), 'rev-parse', 'HEAD'], text=True).strip()
    metadata = {'version': chromium['version'], 'revision': stamp['revision'],
                'source': 'https://github.com/luis21/senda', 'commit': commit,
                'configuration': 'DevPersonal' if args.personal_dev else 'Release',
                'redistributable': not args.personal_dev, 'signed': False, 'patches': stamp['patches']}
    write_package_files(sorted(files, key=lambda item: item['relative'].casefold()), args.generated, metadata)
    print(json.dumps({'files': len(files), 'bytes': sum(item['size'] for item in files)}))


if __name__ == '__main__':
    main()
