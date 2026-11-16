import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare_filter_snapshot', Path(__file__).parents[1] / 'tools/prepare_filter_snapshot.py')
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

class SourceValidation(unittest.TestCase):
    def test_rejects_html_and_wrong_list(self):
        with self.assertRaises(ValueError):
            tool.validate_source(b'<html>Not a filter list</html>', 'EasyList')
        with self.assertRaises(ValueError):
            tool.validate_source(b'[Adblock Plus 2.0]\n! Title: Other\n! Version: 202611150000\n'+b'||example.com^\n'*200, 'EasyList')

    def test_reports_source_version_hash_and_rules(self):
        raw = b'[Adblock Plus 2.0]\n! Title: EasyList\n! Version: 202611150000\n' + b'||example.com^\n'*200
        result = tool.validate_source(raw, 'EasyList')
        self.assertEqual(result['version'], '202611150000')
        self.assertEqual(result['source_rules'], 200)
        self.assertEqual(len(result['sha256']), 64)

    def test_rejects_bad_version_and_oversize(self):
        raw = b'[Adblock Plus 2.0]\n! Title: EasyList\n! Version: ../../escape\n'+b'||example.com^\n'*200
        with self.assertRaises(ValueError):
            tool.validate_source(raw, 'EasyList')
        with self.assertRaises(ValueError):
            tool.validate_source(b'x'*(20*1024*1024+1), 'EasyList')

if __name__ == '__main__':
    unittest.main()
