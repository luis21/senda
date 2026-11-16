import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sync_filter_snapshot', Path(__file__).parents[1] / 'tools/sync_filter_snapshot.py')
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

class SnapshotVerification(unittest.TestCase):
    def fixture(self, root):
        data = b'a'*1024
        (root/'UnindexedRules').write_bytes(data)
        (root/'LICENSE').write_text('Fixture license')
        manifest = {'schema':1,'format':'chromium-unindexed-ruleset','bytes':1024,'sha256':hashlib.sha256(data).hexdigest(),'license':'CC-BY-SA-3.0','sources':[{'version':'202611150000'}]}
        (root/'manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_detects_corrupt_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            (root/'UnindexedRules').write_bytes(b'b'*1024)
            with self.assertRaises(ValueError):
                tool.verify_snapshot(root)

    def test_preserves_destination_on_invalid_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root/'source'; source.mkdir()
            self.fixture(source)
            (source/'UnindexedRules').write_bytes(b'b'*1024)
            destination = root/'chromium'; destination.mkdir()
            sentinel = destination/'existing'; sentinel.write_text('keep')
            with self.assertRaises(ValueError):
                tool.sync_snapshot(source, destination)
            self.assertEqual(sentinel.read_text(),'keep')
            self.assertFalse((destination/'third_party').exists())

    def test_copies_only_fixed_names_and_license(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root/'source'; source.mkdir()
            self.fixture(source)
            tool.sync_snapshot(source, root/'chromium')
            target = root/'chromium/third_party/senda_filter_lists'
            self.assertEqual((target/'UnindexedRules').read_bytes(),b'a'*1024)
            self.assertIn('CC-BY-SA-3.0',(target/'README.chromium').read_text())

if __name__ == '__main__':
    unittest.main()
