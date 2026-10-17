import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('source_preflight', ROOT / 'scripts/source_preflight.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourcePreflightTests(unittest.TestCase):
    def test_all_8_bureaus_and_16_page_roles(self):
        sources = __import__('json').loads((ROOT / 'scripts/sources.json').read_text())
        report = module.run(sources, checker=lambda url: {'accessible': True, 'status': 200})
        self.assertEqual(report['pages_tested'], 16)
        self.assertEqual(report['bureaus_tested'], 8)
        self.assertEqual(report['unique_urls_tested'], 15)  # 四国は共通ページ
        self.assertTrue(report['all_pages_accessible'])

    def test_failed_link_is_not_success(self):
        sources = [{'id': 'x', 'name': 'test', 'facilities': 'https://kouseikyoku.mhlw.go.jp/a',
                    'filings': 'https://kouseikyoku.mhlw.go.jp/b'}]
        report = module.run(sources, checker=lambda url: {'accessible': url.endswith('/a'), 'status': 200 if url.endswith('/a') else 403})
        self.assertFalse(report['all_pages_accessible'])

    def test_blocks_unapproved_hosts(self):
        with self.assertRaises(ValueError):
            module.validate_url('https://example.com/secret')
        with self.assertRaises(ValueError):
            module.validate_url('http://kouseikyoku.mhlw.go.jp/a')


if __name__ == '__main__':
    unittest.main()
