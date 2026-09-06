#!/usr/bin/env python3
"""Exercise lossless import and conflict rejection in isolated temporary repos."""
import importlib.util, json, pathlib, shutil, subprocess, tempfile, unittest

HERE=pathlib.Path(__file__).resolve().parent

class SyncSafety(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.r=pathlib.Path(self.tmp.name)
        shutil.copytree(HERE,self.r/'tools/wiki',ignore=shutil.ignore_patterns('__pycache__'))
        (self.r/'wiki/pages/demo').mkdir(parents=True)
        self.page=self.r/'wiki/pages/demo/example.md'
        self.original='---\ntitle: 示例\nslug: example\n---\n\n# 示例\n\n原稿，保留 punctuation!\n\n```python\n# 不是标题\n```\n'
        self.page.write_text(self.original)
        self.c={'categories':[{'slug':'demo','title':'示例分类'}], 'navigation':[],
                'articles':[{'slug':'example','title':'示例','category':'demo','path':'wiki/pages/demo/example.md'}]}
        (self.r/'wiki/catalog.json').write_text(json.dumps(self.c))
        spec=importlib.util.spec_from_file_location('fixture_sync',self.r/'tools/wiki/sync.py')
        self.mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.mod)
        self.call('to-xmind')

    def tearDown(self): self.tmp.cleanup()

    def call(self,mode,ok=True):
        p=subprocess.run(['python3',str(self.r/'tools/wiki/sync.py'),mode],capture_output=True,text=True)
        self.assertEqual(p.returncode==0,ok,p.stdout+p.stderr);return p

    def edit_map(self,text):
        self.mod.build_map(self.c,{'example':text.encode()},self.mod.MAP)

    def test_noop_preserves_bytes(self):
        self.call('from-xmind');self.assertEqual(self.page.read_bytes(),self.original.encode())

    def test_note_roundtrip_and_backup(self):
        changed=self.original.replace('原稿，保留 punctuation!','用户手改：第二版。\n\n- 表格与代码之外的补充')
        self.edit_map(changed);self.call('from-xmind')
        self.assertEqual(self.page.read_text(),changed)
        self.call('verify')
        backups=list((self.r/'.local/wiki-sync/backups').rglob('example.md'))
        self.assertTrue(any(p.read_text()==self.original for p in backups))

    def test_both_changed_stops_without_overwriting(self):
        self.edit_map(self.original+'\nXMind 新内容\n')
        md=self.original+'\nObsidian 新内容\n';self.page.write_text(md)
        xhash=self.mod.digest(self.mod.MAP.read_bytes())
        self.call('auto',False);self.call('to-xmind',False);self.call('from-xmind',False)
        self.assertEqual(self.page.read_text(),md)
        self.assertEqual(self.mod.digest(self.mod.MAP.read_bytes()),xhash)

    def test_structure_change_stops(self):
        altered=json.loads(json.dumps(self.c));altered['categories'][0]['title']='改分类'
        self.mod.build_map(altered,{'example':self.original.encode()},self.mod.MAP)
        self.call('from-xmind',False);self.assertEqual(self.page.read_text(),self.original)

if __name__=='__main__': unittest.main()
