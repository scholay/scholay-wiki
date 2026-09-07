#!/usr/bin/env python3
import importlib.util,json,pathlib,shutil,tempfile,unittest
HERE=pathlib.Path(__file__).resolve().parent

class NativeGraph(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.r=pathlib.Path(self.tmp.name)
        shutil.copytree(HERE,self.r/'tools/wiki',ignore=shutil.ignore_patterns('__pycache__'))
        spec=importlib.util.spec_from_file_location('fixture_links',self.r/'tools/wiki/links.py');self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.c={'categories':[{'slug':'demo','title':'示例分类'}],'navigation':[],'articles':[]}
        for slug,title,related in [('a','甲',['b','missing']),('b','乙',['a'])]:
            path=self.r/f'wiki/pages/demo/{slug}.md';path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(f'---\ntitle: {title}\nslug: {slug}\ncategory: demo\ncustom: keep\n---\n\n# {title}\n\n原有段落与[[自由双链]]。\n')
            self.c['articles'].append({'slug':slug,'title':title,'category':'demo','path':str(path.relative_to(self.r)),'related':related})
        (self.r/'wiki/catalog.json').write_text(json.dumps(self.c))
        self.structure={'categories':{'demo':[{'id':'topic','title':'原主题','articles':['a','b']}]},'workflow':[],'support':[]}
        self.sp=self.r/'wiki/structure.json';self.sp.write_text(json.dumps(self.structure))
        self.bodies={a['slug']:self.m.wiki.split((self.r/a['path']).read_text())[1] for a in self.c['articles']}
    def tearDown(self):self.tmp.cleanup()
    def test_native_links_resolve_and_body_is_identical(self):
        report=self.m.perform('refresh',self.r)
        self.assertEqual(report['related_links'],2);self.assertEqual(report['unresolved'],[{'source':'a','target':'missing'}])
        for a in self.c['articles']:
            fm,body=self.m.wiki.split((self.r/a['path']).read_text());self.assertEqual(body,self.bodies[a['slug']]);self.assertIn('custom: keep',fm)
            self.assertIn('scholay_related: ["[[wiki/pages/demo/',fm);self.assertNotIn('missing',fm)
        self.assertFalse(self.m.plan(self.r)[0])
    def test_edit_or_remove_managed_properties_is_a_conflict(self):
        self.m.perform('refresh',self.r);p=self.r/self.c['articles'][0]['path'];original=p.read_text()
        for updated in [original.replace('[[wiki/pages/demo/b|乙]]','[[manual]]'),'\n'.join(line for line in original.split('\n') if not line.startswith(('scholay_topics:','scholay_related:')))]:
            p.write_text(updated)
            with self.assertRaises(ValueError):self.m.perform('refresh',self.r)
            self.assertEqual(p.read_text(),updated)
    def test_topic_rename_removes_stale_edges_and_backs_up(self):
        self.m.perform('refresh',self.r);old=self.r/'wiki/topics/demo/原主题.md';raw=old.read_bytes()
        self.structure['categories']['demo'][0]['title']='新主题';self.sp.write_text(json.dumps(self.structure));self.m.perform('refresh',self.r)
        self.assertFalse(old.exists());self.assertTrue((self.r/'wiki/topics/demo/新主题.md').exists())
        self.assertTrue(any(p.read_bytes()==raw for p in (self.r/'.local/graph-links/backups').rglob('原主题.md')));self.assertFalse(self.m.plan(self.r)[0])
    def test_modified_old_topic_blocks_rename(self):
        self.m.perform('refresh',self.r);old=self.r/'wiki/topics/demo/原主题.md';old.write_text(old.read_text()+'用户记录\n')
        self.structure['categories']['demo'][0]['title']='新主题';self.sp.write_text(json.dumps(self.structure))
        with self.assertRaises(ValueError):self.m.perform('refresh',self.r)
        self.assertTrue(old.exists());self.assertFalse((self.r/'wiki/topics/demo/新主题.md').exists())

if __name__=='__main__':unittest.main()
