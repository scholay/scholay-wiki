#!/usr/bin/env python3
"""Maintain Excalidraw views of canonical Markdown; never copy or rewrite article bodies."""
import argparse, copy, hashlib, json, pathlib, re, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[2]
CAT = ROOT / 'wiki/catalog.json'
BOARDS = ROOT / 'wiki/boards'
STATE = ROOT / '.local/excalidraw/state.json'
COLORS = ['#a61e4d', '#1864ab', '#087f5b', '#6741d9', '#9c6500', '#0b7285', '#495057', '#862e9c']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_bytes(data)
    temp.replace(path)


def dump(path, obj):
    atomic(path, (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode())


def split(text):
    m = re.match(r'\A---\n.*?\n---\n\n?', text, re.S)
    if not m:
        raise ValueError('Missing YAML frontmatter')
    return m[0], text[m.end():]


def catalog():
    c = json.loads(CAT.read_text())
    cats = [a['slug'] for a in c['categories']]
    slugs = [a['slug'] for a in c['articles']]
    paths = [a['path'] for a in c['articles']]
    if len(slugs) != len(set(slugs)) or len(paths) != len(set(paths)) or len(cats) != len(set(cats)):
        raise ValueError('Duplicate category, article slug or path')
    for slug in cats + slugs:
        if not re.fullmatch(r'[a-z0-9-]+', slug):
            raise ValueError('Invalid slug: ' + slug)
    for a in c['articles']:
        p = (ROOT / a['path']).resolve()
        if not p.is_relative_to((ROOT / 'wiki/pages').resolve()) or a['category'] not in cats:
            raise ValueError('Invalid article path/category: ' + a['slug'])
        fm, body = split(p.read_text())
        for key in ['slug', 'title', 'category']:
            value = next((line[len(key)+2:] for line in fm.splitlines() if line.startswith(key + ': ')), None)
            if value != a[key]:
                raise ValueError(f'{a["slug"]}: frontmatter {key} differs from catalog')
        if body.splitlines()[0] != '# ' + a['title']:
            raise ValueError(a['slug'] + ': H1 differs from catalog')
    def check(nodes):
        for n in nodes:
            target = n.get('target', {}).get('articleSlug')
            if target and target not in slugs:
                raise ValueError('Unknown navigation article: ' + target)
            check(n.get('children', []))
    check(c['navigation'])
    return c


def eid(key):
    return digest(key.encode())[:8]


def element(key, kind, x, y, w, h, color='#343a40', text=None, link=None, size=20):
    e = dict(id=eid(key), type=kind, x=x, y=y, width=w, height=h, angle=0,
             strokeColor=color, backgroundColor='transparent', fillStyle='solid',
             strokeWidth=1, strokeStyle='solid', roughness=0, opacity=100,
             groupIds=[], frameId=None, roundness=None, seed=int(eid(key),16) % 2147483647,
             version=1, versionNonce=1, isDeleted=False, boundElements=None,
             updated=0, link=link, locked=False)
    if text is not None:
        e.update(text=text, originalText=text, fontSize=size, fontFamily=2,
                 textAlign='left', verticalAlign='top', containerId=None, autoResize=True, lineHeight=1.25)
    if kind == 'embeddable':
        e['scale'] = [1, 1]
    owned = {k:e.get(k) for k in ('text','originalText','link') if k in e}
    e['customData'] = {'scholay': {'key':key, 'owned':owned}}
    return e


def graph_module():
    import importlib.util
    spec=importlib.util.spec_from_file_location('scholay_graph', pathlib.Path(__file__).with_name('graph.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def desired(c):
    return graph_module().generate(c, element, ROOT/'wiki/structure.json')


DRAWING = re.compile(r'(^##? Drawing\n```(json|compressed-json)\n)(.*?)(\n```)', re.M|re.S)


def sections(text, scene):
    drawing = DRAWING.search(text)
    if not drawing: raise ValueError('Missing Drawing section')
    prefix = text[:drawing.start()]
    header = re.search(r'^##? Text Elements\n', prefix, re.M)
    if not header: raise ValueError('Missing Text Elements section')
    start = header.end()
    ids = {e['id'] for e in scene['elements'] if e['type']=='text'}
    blocks = list(re.finditer(r' \^([A-Za-z0-9_-]+)\n(?:\n|$)', prefix[start:]))
    mapped = {}; cursor = start
    for block in blocks:
        if block[1] not in ids: continue
        if block[1] in mapped: raise ValueError('Duplicate text block ID: '+block[1])
        mapped[block[1]] = prefix[cursor:start+block.start()]
        cursor = start+block.end()
    end = cursor
    if not mapped:
        following = re.search(r'^##? (?:Element Links|Embedded Files)\n|^%%\s*$', prefix[start:], re.M)
        end = start+following.start() if following else len(prefix)
    tail = prefix[end:]
    links = re.search(r'^##? Element Links\n(.*?)(?=^##? Embedded Files\n|^%%\s*$|\Z)',tail,re.M|re.S)
    return header, end, mapped, links, tail, drawing


def read_board(path, text=None):
    if text is None: text=path.read_text()
    m=DRAWING.search(text)
    if not m: raise ValueError('Missing Drawing section: '+str(path))
    data=m[3]
    if m[2]=='compressed-json':
        js="const lz=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=lz.decompressFromBase64(s.replace(/\\s/g,''));if(!d)process.exit(1);process.stdout.write(d);});"
        data=subprocess.run(['node','-e',js,str(ROOT/'tools/wiki/vendor/lz-string.cjs')],input=data,text=True,capture_output=True,check=True).stdout
    scene=json.loads(data)
    if scene.get('type')!='excalidraw': raise ValueError('Invalid scene: '+str(path))
    _,_,mapped,links,_,_=sections(text,scene)
    for e in scene['elements']:
        if e['type']=='text' and e['id'] in mapped:
            e['text']=e['originalText']=mapped[e['id']]
    if links:
        mapped=dict(re.findall(r'^([A-Za-z0-9_-]+): (.+)$',links[1],re.M))
        for e in scene['elements']:
            if e['id'] in mapped: e['link']=mapped[e['id']]
    return text,scene


def render(scene, old=None):
    if old is None:
        old='---\nexcalidraw-plugin: parsed\ntags: [excalidraw, scholay]\n---\n\n# Excalidraw Data\n\n## Text Elements\n\n## Element Links\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","elements":[]}\n```\n%%\n'
    _,previous=read_board(pathlib.Path('in-memory'),old)
    header,end,_,links,tail,drawing=sections(old,previous)
    text_blocks=[]
    for e in scene['elements']:
        if e['type']!='text' or e.get('isDeleted'): continue
        value=e.get('originalText',e['text'])
        if DRAWING.search(value) or re.search(r' \^[A-Za-z0-9_-]{8}\n',value):
            raise ValueError('Text contains a reserved Obsidian Excalidraw delimiter; remove the Drawing fence or block-ID marker.')
        text_blocks.append(value+' ^'+e['id']+'\n\n')
    linktext=''.join(e['id']+': '+e['link']+'\n' for e in scene['elements'] if e.get('link') and not e.get('isDeleted'))+'\n'
    if links: tail=tail[:links.start()]+'## Element Links\n'+linktext+tail[links.end():]
    else: tail='## Element Links\n'+linktext+tail
    return (old[:header.end()]+''.join(text_blocks)+tail+'## Drawing\n```json\n'+json.dumps(scene,ensure_ascii=False,indent=2)+'\n```'+old[drawing.end():]).encode()


def reconcile(scene, expected, relayout=False):
    result=copy.deepcopy(scene); elements=result['elements']; lookup={e['id']:e for e in elements}
    if len(lookup)!=len(elements): raise ValueError('Duplicate element IDs')
    if len({e['id'] for e in expected})!=len(expected): raise ValueError('Generated ID collision')
    wanted={e['id'] for e in expected}
    for fresh in expected:
        prior=lookup.get(fresh['id'])
        if prior is None:
            # A connected structure must be inserted as a layout, not stacked element by element.
            elements.append(copy.deepcopy(fresh)); continue
        meta=prior.get('customData',{}).get('scholay')
        if not meta or meta['key']!=fresh['customData']['scholay']['key']:
            raise ValueError('Managed ID collision: '+fresh['id'])
        if fresh['type']=='arrow' and not relayout:
            for side in ('startBinding','endBinding'):
                if (prior.get(side) or {}).get('elementId')!=(fresh.get(side) or {}).get('elementId'):
                    raise ValueError('Managed relationship changed; reconcile structure first: '+meta['key'])
        if prior.get('isDeleted'):

            raise ValueError('Managed element deleted; reconcile catalog first: '+meta['key'])
        for field, previous in meta['owned'].items():
            new=fresh.get(field)
            if prior.get(field)!=previous and prior.get(field)!=new:
                raise ValueError('Managed title/link edited on canvas; reconcile catalog first: '+meta['key'])
            if prior.get(field)!=new:
                prior[field]=new; prior['version']=prior.get('version',1)+1
        if relayout:
            for field in ('x','y','width','height','points','startBinding','endBinding','containerId','groupIds'):
                if field in fresh: prior[field]=copy.deepcopy(fresh[field])
        # Maintain reciprocal bindings while retaining user-created arrows/annotations.
        old_bindings=prior.get('boundElements') or []
        generated_ids={e['id'] for e in elements if e.get('customData',{}).get('scholay')}
        bindings=[b for b in old_bindings if b['id'] not in generated_ids]
        bindings.extend(copy.deepcopy(fresh.get('boundElements') or []))
        if bindings or prior.get('boundElements') is not None:prior['boundElements']=bindings
        prior['customData']['scholay']=fresh['customData']['scholay']
    for e in elements:
        if e.get('customData',{}).get('scholay') and e['id'] not in wanted and not e.get('isDeleted'):
            e['isDeleted']=True;e['version']=e.get('version',1)+1
    actual={e['id']:e for e in elements};templates={e['id']:e for e in expected}
    for fresh in expected:
        if fresh['type']!='arrow' or fresh['id'] in lookup:continue
        edge=actual[fresh['id']];a=actual[edge['startBinding']['elementId']];b=actual[edge['endBinding']['elementId']]
        if any(node.get(k)!=templates[node['id']].get(k) for node in (a,b) for k in ('x','y','width','height')):
            graph_module().route(edge,a,b)
    return result


def plan(c, snapshots=None, relayout=False):
    pending={}; errors=[]
    for name,expected in desired(c).items():
        path=BOARDS/name
        try:
            raw=path.read_bytes() if path.exists() else None
            if snapshots is not None: snapshots[path]=raw
            if raw is not None:
                old,scene=read_board(path, raw.decode()); result=reconcile(scene,expected,relayout)
                # Never rewrite a scene only to reformat/recompress it.
                if scene!=result: pending[path]=render(result,old)
            else:
                scene={'type':'excalidraw','version':2,'source':'https://github.com/scholay/scholay',
                       'elements':expected,'appState':{'viewBackgroundColor':'#ffffff','gridSize':None},'files':{}}
                pending[path]=render(scene)
        except (ValueError,KeyError,subprocess.CalledProcessError) as e: errors.append(str(e))
    if errors: raise ValueError('\n'.join(errors))
    return pending


def verify(c):
    pending=plan(c)
    if pending: raise ValueError('Views need refresh: '+', '.join(p.name for p in pending))
    print(f'Verified: {len(c["articles"])} linked Markdown nodes; {len(c["navigation"])} navigation groups; {len(desired(c))} boards.')


def perform(mode, relayout=False):
    c=catalog()
    if mode=='verify': verify(c);return
    snapshots={}
    pending=plan(c,snapshots,relayout)
    if mode=='status':
        print(json.dumps({'articles':len(c['articles']),'boards':len(desired(c)),
                          'needs_refresh':[p.name for p in pending],'body_sync':'unnecessary: nodes open original Markdown'},ensure_ascii=False));return
    # Prepare and validate all outputs before writing any board.
    if pending:
        backup=ROOT/'.local/excalidraw/backups'/str(time.time_ns())
        observed={p:snapshots[p] for p in pending}
        for p,raw in observed.items():
            if raw is not None: atomic(backup/p.relative_to(ROOT),raw)
        for p,raw in observed.items():
            if (p.read_bytes() if p.exists() else None)!=raw:
                raise ValueError('Board changed during refresh: '+str(p))
        for p,raw in pending.items(): atomic(p,raw)
    dump(STATE,{'catalog':digest(CAT.read_bytes()),'boards':{str(p.relative_to(ROOT)):digest(p.read_bytes()) for p in BOARDS.glob('*.excalidraw.md')}})
    verify(c)
    print(f'Refreshed {len(pending)} board(s). Article bodies were not rewritten.')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['status','verify','refresh','auto'])
    p.add_argument('--layout',action='store_true',help='Reapply generated node positions and bound edges; preserve free annotations and files')
    args=p.parse_args()
    import fcntl
    lock=ROOT/'.local/excalidraw/lock';lock.parent.mkdir(parents=True,exist_ok=True)
    with lock.open('w') as f:
        fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        perform(args.mode,args.layout)

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,subprocess.CalledProcessError) as e: raise SystemExit(str(e))
