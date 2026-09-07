#!/usr/bin/env python3
"""Temporary vault tests for connected diagrams and lossless visual maintenance."""
import importlib.util,json,pathlib,shutil,subprocess,tempfile,unittest
HERE=pathlib.Path(__file__).resolve().parent

class NativeViews(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.r=pathlib.Path(self.tmp.name)
        shutil.copytree(HERE,self.r/'tools/wiki',ignore=shutil.ignore_patterns('__pycache__'))
        (self.r/'wiki/pages/demo').mkdir(parents=True)
        self.page=self.r/'wiki/pages/demo/example.md'
        self.original='---\ntitle: 示例\nslug: example\ncategory: demo\n---\n\n# 示例\n\n原稿。\n'
        self.page.write_text(self.original)
        self.c={'categories':[{'slug':'demo','title':'分类'}], 'navigation':[{'id':'demo','title':'导航','target':{'articleSlug':'example'}}],
                'articles':[{'slug':'example','title':'示例','category':'demo','path':'wiki/pages/demo/example.md'}]}
        self.cat=self.r/'wiki/catalog.json';self.cat.write_text(json.dumps(self.c))
        spec=importlib.util.spec_from_file_location('fixture_sync',self.r/'tools/wiki/sync.py')
        self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.m.perform('refresh');self.board=self.m.BOARDS/'demo.excalidraw.md'
    def tearDown(self):self.tmp.cleanup()
    def test_native_body_edit_and_noop_keep_boards_bytes(self):
        before=self.board.read_bytes();self.page.write_text(self.original+'\n新正文\n')
        self.m.perform('refresh');self.assertEqual(before,self.board.read_bytes())
        self.assertTrue(self.page.read_text().endswith('新正文\n'))
    def test_catalog_rename_preserves_layout_annotation_and_files(self):
        old,scene=self.m.read_board(self.board);e=next(e for e in scene['elements'] if e['type']=='rectangle' and e.get('customData',{}).get('scholay',{}).get('articleSlug')=='example');e['x']=1234;e['width']=789
        scene['elements'].append({'id':'manual','type':'text','text':'自由批注','originalText':'自由批注','x':0,'y':900,'height':30})
        scene['files']={'asset':{'dataURL':'data:image/png;base64,example'}}
        self.board.write_bytes(self.m.render(scene,old))
        self.c['articles'][0]['title']='新标题';self.cat.write_text(json.dumps(self.c));self.page.write_text(self.original.replace('示例','新标题'))
        self.m.perform('refresh');_,after=self.m.read_board(self.board)
        embed=next(e for e in after['elements'] if e['type']=='rectangle' and e.get('customData',{}).get('scholay',{}).get('articleSlug')=='example')
        self.assertEqual((embed['x'],embed['width']),(1234,789));self.assertEqual(after['files'],scene['files'])
        self.assertEqual(after['elements'][-1],scene['elements'][-1])
        self.assertTrue(list((self.r/'.local/excalidraw/backups').rglob('*.md')))
    def test_semantic_conflict_stops_all_writes(self):
        old,scene=self.m.read_board(self.board);next(e for e in scene['elements'] if e['type']=='rectangle' and e.get('customData',{}).get('scholay',{}).get('articleSlug')=='example')['link']='[[elsewhere.md]]'
        self.board.write_bytes(self.m.render(scene,old));before={p:p.read_bytes() for p in self.m.BOARDS.glob('*.md')}
        with self.assertRaises(ValueError):self.m.perform('refresh')
        self.assertEqual(before,{p:p.read_bytes() for p in before});self.assertEqual(self.page.read_text(),self.original)
    def test_compressed_plugin_save_supported_and_kept(self):
        old,scene=self.m.read_board(self.board)
        js="const lz=require(process.argv[1]);process.stdout.write(lz.compressToBase64(process.argv[2]));"
        compressed=subprocess.check_output(['node','-e',js,str(self.r/'tools/wiki/vendor/lz-string.cjs'),json.dumps(scene)],text=True)
        text=self.m.DRAWING.sub(lambda m:'## Drawing\n```compressed-json\n'+compressed+'\n```',old)
        self.board.write_text(text);self.m.perform('verify');self.m.perform('refresh');self.assertEqual(self.board.read_text(),text)
    def test_add_and_remove_articles_never_rewrites_body(self):
        p=self.r/'wiki/pages/demo/second.md';p.write_text(self.original.replace('example','second').replace('示例','第二篇'))
        self.c['articles'].append({'slug':'second','title':'第二篇','category':'demo','path':'wiki/pages/demo/second.md'})
        self.cat.write_text(json.dumps(self.c));self.m.perform('refresh')
        _,scene=self.m.read_board(self.board);self.assertEqual(sum(e['type']=='rectangle' and bool(e.get('customData',{}).get('scholay',{}).get('articleSlug')) and not e['isDeleted'] for e in scene['elements']),2)
        self.c['articles'].pop();self.cat.write_text(json.dumps(self.c));self.m.perform('refresh')
        _,scene=self.m.read_board(self.board);self.assertEqual(sum(e['type']=='rectangle' and bool(e.get('customData',{}).get('scholay',{}).get('articleSlug')) and not e['isDeleted'] for e in scene['elements']),1)
        self.assertEqual(self.page.read_text(),self.original);self.assertTrue(p.exists())
    def test_bound_tree_has_a_path_to_every_article(self):
        _,scene=self.m.read_board(self.board);by={e['id']:e for e in scene['elements'] if not e['isDeleted']}
        root=next(e['id'] for e in by.values() if e.get('customData',{}).get('scholay',{}).get('role')=='root')
        adj={k:set() for k,e in by.items() if e['type']=='rectangle'}
        for e in by.values():
            if e['type']!='arrow':continue
            a,b=e['startBinding']['elementId'],e['endBinding']['elementId']
            self.assertIn(a,adj);self.assertIn(b,adj)
            self.assertIn({'id':e['id'],'type':'arrow'},by[a]['boundElements'])
            self.assertIn({'id':e['id'],'type':'arrow'},by[b]['boundElements'])
            adj[a].add(b);adj[b].add(a)
        visited=set();queue=[root]
        while queue:
            node=queue.pop()
            if node in visited:continue
            visited.add(node);queue.extend(adj[node]-visited)
        self.assertEqual(visited,set(adj));self.assertFalse(any(e['type']=='embeddable' for e in by.values()))
    def test_rebinding_managed_edge_is_rejected(self):
        _,scene=self.m.read_board(self.board)
        edge=next(e for e in scene['elements'] if e['type']=='arrow')
        edge['endBinding']['elementId']=edge['startBinding']['elementId']
        with self.assertRaises(ValueError):self.m.reconcile(scene,self.m.desired(self.c)[self.board.name])
    def test_new_edge_uses_moved_parent_position(self):
        _,scene=self.m.read_board(self.board)
        parent=next(e for e in scene['elements'] if e.get('customData',{}).get('scholay',{}).get('role')=='group')
        parent['x']+=1000
        self.c['articles'].append({'slug':'second','title':'第二篇','category':'demo','path':'wiki/pages/demo/second.md'})
        updated=self.m.reconcile(scene,self.m.desired(self.c)[self.board.name]);nodes={e['id']:e for e in updated['elements']}
        leaf=next(e for e in nodes.values() if e['type']=='rectangle' and e.get('customData',{}).get('scholay',{}).get('articleSlug')=='second')
        edge=next(e for e in nodes.values() if e['type']=='arrow' and e['endBinding']['elementId']==leaf['id'])
        self.assertEqual(edge['x'],parent['x']+parent['width']+8)
        self.assertEqual(self.m.reconcile(updated,self.m.desired(self.c)[self.board.name]),updated)
    def test_frontmatter_mismatch_rejected(self):
        self.page.write_text(self.original.replace('title: 示例','title: 错误'))
        with self.assertRaises(ValueError):self.m.perform('verify')
    def test_manually_deleted_card_requires_reconciliation(self):
        old,scene=self.m.read_board(self.board);scene['elements'][-1]['isDeleted']=True
        self.board.write_bytes(self.m.render(scene,old))
        with self.assertRaises(ValueError):self.m.perform('refresh')

if __name__=='__main__':unittest.main()
