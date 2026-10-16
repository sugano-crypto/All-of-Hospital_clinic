import importlib.util, unittest, tempfile, io, zipfile
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
spec=importlib.util.spec_from_file_location('audit',Path(__file__).parents[1]/'scripts/acquisition_audit.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class AcquisitionTests(unittest.TestCase):
 def test_47_prefectures(self):
  self.assertEqual(len(audit.SOURCES),8);self.assertEqual(sum(s['prefectures'] for s in audit.SOURCES),47)
 def test_retry_only_failed_bureaus(self):
  state={'month':'2026-10','bureaus':{s['id']:{'acquisition_status':'downloaded'} for s in audit.SOURCES}}
  state['bureaus']['tohoku']['acquisition_status']='failed'
  self.assertEqual([s['id'] for s in audit.pending_sources(state,'2026-10',True)],['tohoku'])
  with self.assertRaises(ValueError):audit.pending_sources(state,'2026-11',True)
 def test_all_sheets_in_zip_are_read(self):
  import openpyxl
  book=openpyxl.Workbook();book.active.append(['医療機関','施設基準']);book.create_sheet('hidden').sheet_state='hidden';stream=io.BytesIO();book.save(stream)
  z=io.BytesIO()
  with zipfile.ZipFile(z,'w') as f:f.writestr('sample.xlsx',stream.getvalue())
  data=audit.inspect_download(z.getvalue(),'https://kouseikyoku.mhlw.go.jp/source.zip')
  self.assertEqual(len(data[0]['sheets']),2)
 def test_policy_errors_are_recorded_and_no_publish(self):
  def blocked(url):raise OSError('CONNECT tunnel failed, response 403')
  with tempfile.TemporaryDirectory() as tmp:
   state=audit.run(tmp,'all',datetime(2026,10,20,6,tzinfo=ZoneInfo('Asia/Tokyo')),blocked)
   self.assertFalse(state['ready_to_publish']);self.assertEqual(len(state['bureaus']),8)
   self.assertTrue(all(s['acquisition_status']=='failed' for s in state['bureaus'].values()))
 def test_links_keep_every_workbook_and_official_https_only(self):
  links=audit.discover(b'<a href="a.xlsx">A</a><a href="b.zip">B</a>','https://kouseikyoku.mhlw.go.jp/a/')
  self.assertEqual(len(links),2)
  with self.assertRaises(ValueError):audit.check_url('https://example.com/file.xlsx')
if __name__=='__main__':unittest.main()
