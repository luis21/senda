import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'tools/package_senda.py'
spec = importlib.util.spec_from_file_location('package_senda', MODULE)
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class InstallerPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / 'out'
        self.output.mkdir()
        self.names = ['chrome.exe', 'chrome.dll', 'resources.pak', 'icudtl.dat', 'locales/en-US.pak']
        for name in self.names:
            file = self.output / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(('fixture:' + name).encode())

    def stamp(self, debug=False):
        (self.root / 'config').mkdir(exist_ok=True)
        (self.root / 'patches').mkdir(exist_ok=True)
        (self.root / 'config/chromium.json').write_text(json.dumps({'revision': 'a' * 40, 'version': '156.0.8078.80'}))
        (self.root / 'patches/series').write_text('0001-test.patch\n')
        patch = self.root / 'patches/0001-test.patch'
        patch.write_bytes(b'patch fixture\n')
        data = {'status': 'success', 'configuration': 'Dev' if debug else 'Release',
                'revision': 'a' * 40, 'patches': {'0001-test.patch': hashlib.sha256(patch.read_bytes()).hexdigest()}}
        (self.output / '.senda-build.json').write_text(json.dumps(data))
        (self.output / 'args.gn').write_text('target_cpu = "x64"\nis_debug = ' + str(debug).lower() + '\n')
        return data

    def test_payload_deduplicates_and_hashes_real_files_without_symbols(self):
        files = package.collect_payload(self.output, self.names + ['./chrome.exe', 'missing.pdb', 'ignored.lib'])
        self.assertEqual(set(self.names), {item['relative'] for item in files})
        self.assertEqual(len(self.names), len(files))
        self.assertTrue(all(len(item['sha256']) == 64 for item in files))

    def test_paths_outside_output_are_rejected(self):
        (self.root / 'outside.dll').write_bytes(b'outside')
        with self.assertRaises(ValueError):
            package.collect_payload(self.output, self.names + ['../outside.dll'])

    def test_missing_runtime_file_is_not_silently_omitted(self):
        with self.assertRaises(FileNotFoundError):
            package.collect_payload(self.output, self.names + ['missing.dll'])

    def test_directory_expansion_keeps_relative_layout(self):
        files = package.collect_payload(self.output, ['chrome.exe', 'locales/'])
        self.assertEqual({'chrome.exe', 'locales/en-US.pak'}, {item['relative'] for item in files})

    def test_output_root_and_profiles_cannot_be_included(self):
        with self.assertRaises(ValueError):
            package.collect_payload(self.output, ['.'])
        profile = self.output / 'User Data/Default/Preferences'
        profile.parent.mkdir(parents=True)
        profile.write_text('private')
        with self.assertRaises(ValueError):
            package.collect_payload(self.output, ['User Data/Default/Preferences'])

    def test_debug_runtime_requires_explicit_test_mode(self):
        for name in ['vcruntime140d.dll', 'msvcp140d_atomic_wait.dll', 'ucrtbased.dll']:
            (self.output / name).write_bytes(b'debug fixture')
            with self.assertRaises(ValueError):
                package.collect_payload(self.output, ['chrome.exe', name])
            self.assertEqual(2, len(package.collect_payload(self.output, ['chrome.exe', name], allow_debug=True)))

    def test_release_stamp_and_patch_integrity_are_required(self):
        self.stamp()
        self.assertEqual('Release', package.validate_build(self.output, self.root)['configuration'])
        (self.root / 'patches/0001-test.patch').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            package.validate_build(self.output, self.root)

    def test_debug_stamp_cannot_be_packaged_as_release(self):
        self.stamp(debug=True)
        with self.assertRaises(ValueError):
            package.validate_build(self.output, self.root)
        self.assertEqual('Dev', package.validate_build(self.output, self.root, allow_debug=True)['configuration'])

    def test_incomplete_build_is_rejected(self):
        data = self.stamp()
        data['status'] = 'incomplete'
        (self.output / '.senda-build.json').write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            package.validate_build(self.output, self.root)

    def test_nsis_literals_escape_instructions_and_reject_newlines(self):
        self.assertEqual(r'a$$b$\"c', package.nsis_escape('a$b"c'))
        with self.assertRaises(ValueError):
            package.nsis_escape('file\nDelete user-data')


if __name__ == '__main__':
    unittest.main()
