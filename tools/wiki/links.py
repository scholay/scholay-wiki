#!/usr/bin/env python3
"""Generate native Obsidian links in properties, keeping every article body byte-identical."""
import argparse,hashlib,importlib.util,json,pathlib,re,time
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('wiki_sync',ROOT/'tools/wiki/sync.py');wiki=importlib.util.module_from_spec(spec);spec.loader.exec_module(wiki)
FIELDS=('scholay_topics','scholay_related')

def link(path,title):return '[['+str(path).removesuffix('.md')+'|'+title+']]'

def property_block(topics,related):
    return ''.join(field+': '+json.dumps(values,ensure_ascii=False)+'\n' for field,values in zip(FIELDS,(topics,related)))

def plan(root=ROOT):
    root=pathlib.Path(root);c=json.loads((root/'wiki/catalog.json').read_text());g=wiki.graph_module();s=g.structure(c,root/'wiki/structure.json')
    by={a['slug']:a for a in c['articles']};pending={};snapshots={};missing=[];relations=0;topic_by_article={}
    statepath=root/'.local/graph-links/state.json'
    state=json.loads(statepath.read_text()) if statepath.exists() else {'properties':{},'topics':{}}
    nextstate={'properties':{},'topics':{}}
    def prepare(path,data):
        raw=path.read_bytes() if path.exists() else None;snapshots[path]=raw
        if raw!=data:pending[path]=data
    def topic(path,title,body,category=None):
        raw=path.read_bytes() if path.exists() else None;key=str(path.relative_to(root))
        content=('---\ntitle: '+title+'\nscholay_generated: graph-topic\n'+('category: '+category+'\n' if category else '')+'---\n\n# '+title+'\n\n'+body+'\n').encode()
        if raw is not None and raw!=content and state['topics'].get(key)!=wiki.digest(raw):raise ValueError('Topic note was edited; reconcile it before refresh: '+key)
        nextstate['topics'][key]=wiki.digest(content);prepare(path,content)
    category_links=[]
    for cat in c['categories']:
        category_path=pathlib.Path('wiki/topics')/cat['slug']/(cat['title']+'.md');category_links.append(link(category_path,cat['title']))
        group_links=[]
        for group in s['categories'][cat['slug']]:
            p=pathlib.Path('wiki/topics')/cat['slug']/(group['title']+'.md');group_links.append(link(p,group['title']))
            for slug in group['articles']:topic_by_article[slug]=link(p,group['title'])
            topic(root/p,group['title'],'所属分类：'+link(category_path,cat['title'])+'\n\n'+ '\n'.join('- '+link(by[slug]['path'],by[slug]['title']) for slug in group['articles']),cat['slug'])
        topic(root/category_path,cat['title'],'\n'.join('- '+v for v in group_links),cat['slug'])
    topic(root/'wiki/topics/Scholay 内容结构.md','Scholay 内容结构','\n'.join('- '+v for v in category_links))
    for a in c['articles']:
        path=root/a['path'];raw=path.read_bytes();text=raw.decode();fm,body=wiki.split(text)
        related=[]
        for slug in dict.fromkeys(a.get('related',[])):
            if slug in by:related.append(link(by[slug]['path'],by[slug]['title']));relations+=1
            else:missing.append({'source':a['slug'],'target':slug})
        block=property_block([topic_by_article[a['slug']]],related)
        # Own only these two single-line properties. A user edit requires explicit reconciliation.
        matches=list(re.finditer(r'^(?:scholay_topics|scholay_related):[^\n]*\n',fm,re.M))
        existing=''.join(m[0] for m in matches)
        if (existing or a['slug'] in state['properties']) and existing!=block and state['properties'].get(a['slug'])!=existing:raise ValueError('Managed graph properties edited: '+a['slug'])
        for field in FIELDS:
            if re.search(r'^'+field+r':',fm,re.M) and not any(m[0].startswith(field+':') for m in matches):raise ValueError('Unsupported multiline graph property: '+a['slug'])
        stripped=re.sub(r'^(?:scholay_topics|scholay_related):[^\n]*\n','',fm,flags=re.M)
        close=stripped.rfind('---\n');updated=(stripped[:close]+block+stripped[close:]+body).encode()
        if wiki.split(updated.decode())[1].encode()!=body.encode():raise AssertionError('Article body changed')
        prepare(path,updated);nextstate['properties'][a['slug']]=block
    for key,expected_hash in state['topics'].items():
        if key in nextstate['topics']:continue
        old=root/key
        if not old.resolve().is_relative_to((root/'wiki/topics').resolve()):raise ValueError('Invalid topic state path')
        raw=old.read_bytes() if old.exists() else None
        if raw is not None:
            if wiki.digest(raw)!=expected_hash:raise ValueError('Old topic note was edited; reconcile before removing: '+key)
            snapshots[old]=raw;pending[old]=None
    report={'articles':len(by),'related_links':relations,'unresolved':missing,'topic_notes':len(nextstate['topics'])}
    return pending,snapshots,nextstate,report

def perform(mode,root=ROOT):
    root=pathlib.Path(root);pending,snapshots,state,report=plan(root)
    if mode=='verify' and pending:raise ValueError('Native graph links need refresh')
    if mode=='refresh':
        backup=root/'.local/graph-links/backups'/str(time.time_ns())
        for p in pending:
            if snapshots[p] is not None:wiki.atomic(backup/p.relative_to(root),snapshots[p])
        for p,raw in snapshots.items():
            if (p.read_bytes() if p.exists() else None)!=raw:raise ValueError('File changed during link refresh: '+str(p))
        for p,data in pending.items():
            if data is None:p.unlink()
            else:wiki.atomic(p,data)
        wiki.dump(root/'.local/graph-links/state.json',state)
        wiki.dump(root/'.local/graph-links/report.json',report)
    print(json.dumps({**{k:v for k,v in report.items() if k!='unresolved'},'unresolved_links':len(report['unresolved']),'changed_files':len(pending)},ensure_ascii=False))
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['status','verify','refresh']);args=p.parse_args()
    import fcntl
    lock=ROOT/'.local/excalidraw/lock';lock.parent.mkdir(parents=True,exist_ok=True)
    try:
        with lock.open('w') as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);perform(args.mode)
    except ValueError as e:raise SystemExit(str(e))
