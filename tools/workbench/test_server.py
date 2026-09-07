import json,pathlib,tempfile,unittest,importlib.util,sys,copy
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from server import Vault, Conflict, wiki
class WorkbenchFiles(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);(self.root/'wiki/pages/demo').mkdir(parents=True);(self.root/'wiki/boards').mkdir()
  self.raw='---\ntitle: 示例\nslug: demo\ncategory: demo\n---\n\n# 示例\n\n用户原文\n'
  self.page=self.root/'wiki/pages/demo/demo.md';self.page.write_text(self.raw)
  (self.root/'wiki/catalog.json').write_text(json.dumps({'articles':[{'slug':'demo','title':'示例','category':'demo','path':'wiki/pages/demo/demo.md'}]}))
  self.scene={'type':'excalidraw','elements':[wiki.element('fixture','text',0,0,20,20,text='普通标题')],'files':{},'appState':{}}
  self.board=self.root/'wiki/boards/demo.excalidraw.md';self.board.write_bytes(wiki.render(self.scene));self.v=Vault(self.root)
 def tearDown(self):self.tmp.cleanup()
 def test_write_same_file_keep_frontmatter_and_backup(self):
  doc=self.v.read('article','demo');new=doc['body']+'\n来自画布\n';result=self.v.write('article','demo',{'body':new,'revision':doc['revision']})
  self.assertEqual(self.page.read_text(),wiki.split(self.raw)[0]+new);self.assertEqual(result['body'],new)
  self.assertEqual(next((self.root/'.local/workbench/backups').rglob('demo.md')).read_text(),self.raw)
 def test_external_md_and_stale_save_conflict(self):
  old=self.v.read('article','demo');self.page.write_text(self.raw+'\nObsidian 更新\n')
  self.assertIn('Obsidian 更新',self.v.read('article','demo')['body'])
  self.assertNotEqual(old['revision'],self.v.snapshot()['articles']['demo'])
  with self.assertRaises(Conflict):self.v.write('article','demo',{'body':old['body']+'browser','revision':old['revision']})
  self.assertIn('Obsidian 更新',self.page.read_text())
 def test_multiline_headings_and_comments_roundtrip(self):
  for body in ['start\n## Heading\nend\n%%\nnotes','替换后的文字','[[wiki/pages/demo/demo.md|示例]]']:
   doc=self.v.read('board',self.board.name);e=doc['scene']['elements'][0];e['text']=e['originalText']=body
   result=self.v.write('board',self.board.name,doc);self.assertEqual(result['scene']['elements'][0]['originalText'],body)
   self.assertEqual(self.board.read_text().count(' ^'+e['id']+'\n'),1)
 def test_nanoids_and_bindings_normalized(self):
  doc=self.v.read('board',self.board.name);scene=doc['scene'];e=scene['elements'][0];e['id']='long_browser_nanoid_123';e['containerId']='other_long_id';box=copy.deepcopy(e);box['id']='other_long_id';box['type']='rectangle';box['boundElements']=[{'id':e['id'],'type':'text'}];scene['elements'].append(box)
  result=self.v.write('board',self.board.name,doc)['scene'];first,second=result['elements'];self.assertEqual(len(first['id']),8);self.assertEqual(first['containerId'],second['id']);self.assertEqual(second['boundElements'][0]['id'],first['id'])
 def test_obsidian_attachment_hydration(self):
  (self.root/'wiki/attachments').mkdir();data=b'PNG fixture bytes';(self.root/'wiki/attachments/a.png').write_bytes(data)
  self.board.write_text(self.board.read_text().replace('%%\n## Drawing','## Embedded Files\nimage123: [[wiki/attachments/a.png]]\n\n%%\n## Drawing'))
  d=self.v.read('board',self.board.name);self.assertEqual(d['scene']['files']['image123']['dataURL'],'data:image/png;base64,UE5HIGZpeHR1cmUgYnl0ZXM=')
  d['scene']['elements'][0]['x']=40;self.v.write('board',self.board.name,d);self.assertIn('image123: [[wiki/attachments/a.png]]',self.board.read_text())
 def test_paths_titles_ambiguous_delimiters_rejected(self):
  for kind,key in [('board','../catalog.json'),('article','../demo')]:
   with self.assertRaises((ValueError,FileNotFoundError)):self.v.read(kind,key)
  d=self.v.read('article','demo');d['body']='# 被修改标题\n';
  with self.assertRaises(ValueError):self.v.write('article','demo',d)
  d=self.v.read('board',self.board.name);d['scene']['elements'][0]['originalText']='unsafe ^abcdefgh\n\n';
  with self.assertRaises(ValueError):self.v.write('board',self.board.name,d)
  self.assertEqual(self.page.read_text(),self.raw)
if __name__=='__main__':unittest.main()
