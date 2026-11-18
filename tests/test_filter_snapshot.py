import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare_filter_snapshot', Path(__file__).parents[1] / 'tools/prepare_filter_snapshot.py')
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

class SourceValidation(unittest.TestCase):
    def test_embedded_exceptions_use_filtering_rules_proto_field(self):
        encode = getattr(tool, 'encode_cosmetic_exception_chunk', None)
        self.assertTrue(callable(encode), 'Snapshot must embed typed exceptions')
        exceptions = tool.prepare_cosmetic_exceptions(['@@||keep.test^$generichide'])
        self.assertEqual(encode(exceptions), b'\x0d\x1a\x0b\x0a\x09keep.test')
        changed = dict(exceptions, disable_all_cosmetic=True)
        self.assertNotEqual(encode(exceptions), encode(changed))

    def test_activation_exceptions_are_conservatively_preserved(self):
        result = tool.prepare_cosmetic_exceptions(['@@||keep.test/path$generichide\n@@||all.test^$elemhide\n@@||other.test^$script\n'])
        self.assertEqual(result['generic_domains'], ['keep.test'])
        self.assertEqual(result['all_domains'], ['all.test'])
        self.assertFalse(result['disable_all_generic'])
        self.assertFalse(result['disable_all_cosmetic'])

    def test_unscoped_activation_exception_prefers_underblocking(self):
        result = tool.prepare_cosmetic_exceptions(['@@/unscoped-regex/$generichide\n'])
        self.assertTrue(result['disable_all_generic'])

    def test_activation_families_local_fragments_and_domain_scopes(self):
        result = tool.prepare_cosmetic_exceptions([
            '@@||music.amazon.$generichide\n@@||www.google.*/search?$generichide\n'
            '@@://localhost:$generichide\n@@$generichide,domain=one.test|two.test|~except.test\n'])
        self.assertEqual(result['generic_domains'], ['one.test', 'two.test'])
        self.assertEqual(result['generic_prefixes'], ['music.amazon.', 'www.google.'])
        self.assertEqual(result['generic_url_substrings'], ['://localhost:'])
        self.assertEqual(result['fallback_rules'], 0)

    def test_unknown_full_hiding_exception_disables_cosmetics_safely(self):
        result = tool.prepare_cosmetic_exceptions(['@@/unknown-regex/$elemhide\n'])
        self.assertTrue(result['disable_all_cosmetic'])
        self.assertEqual(result['fallback_rules'], 1)

    def test_cosmetic_domains_and_exceptions_precede_generic_rules(self):
        rules, stats = tool.prepare_cosmetic_rules('##.ad\nsite.test#@#.ad\nsite.test##[data-ad]\n')
        self.assertEqual(rules, ['site.test##[data-ad]', 'site.test#@#.ad', '##.ad'])
        self.assertEqual(stats['omitted'], 0)

    def test_cosmetic_negative_domains_become_explicit_exceptions(self):
        rules, stats = tool.prepare_cosmetic_rules('~keep.test##.ad\na.test,~b.a.test##.promo\n')
        self.assertEqual(set(rules), {'##.ad', 'keep.test#@#.ad', 'a.test##.promo', 'b.a.test#@#.promo'})
        self.assertEqual(stats['omitted'], 0)

    def test_unsupported_exception_cannot_turn_into_a_false_positive(self):
        rules, stats = tool.prepare_cosmetic_rules('##.ad\n~site.test#@#.ad\n##.safe\n')
        self.assertEqual(rules, ['##.safe'])
        self.assertEqual(stats['omitted'], 2)

    def test_cosmetic_rejects_declarations_and_non_css_syntax(self):
        rules, stats = tool.prepare_cosmetic_rules('##.ad {color:red}\n##.ad:style(display:none)\n##.ad/*\n##.safe\n')
        self.assertEqual(rules, ['##.safe'])
        self.assertEqual(stats['omitted'], 3)

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
