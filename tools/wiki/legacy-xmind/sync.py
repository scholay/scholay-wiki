#!/usr/bin/env python3
"""Lossless page-note mirror. Python 3 + Node.js; no third-party packages."""
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[3]
CAT = ROOT / 'wiki/catalog.json'
MAP = ROOT / 'wiki/Scholay.xmind'
STATE = ROOT / '.local/wiki-sync/state.json'
VENDOR = pathlib.Path(__file__).parent / 'vendor'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_bytes(data)
    temp.replace(path)

def dump(path, obj):
    atomic(path, (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode())

def run(script, payload):
    p = subprocess.run(['node', str(VENDOR / script)], input=json.dumps(payload),
                       text=True, capture_output=True, check=True)
    return p.stdout

def catalog():
    c = json.loads(CAT.read_text())
    slugs = [a['slug'] for a in c['articles']]
    if len(slugs) != len(set(slugs)):
        raise ValueError('Duplicate article slug')
    for a in c['articles']:
        p = (ROOT / a['path']).resolve()
        if not p.is_relative_to(ROOT / 'wiki/pages') or not re.fullmatch(r'[a-z0-9-]+', a['slug']):
            raise ValueError('Invalid article path or slug')
    return c

def files(c):
    return {a['slug']: (ROOT / a['path']).read_bytes() for a in c['articles']}

def split(text):
    m = re.match(r'\A---\n.*?\n---\n\n?', text, re.S)
    if not m:
        raise ValueError('Missing YAML frontmatter')
    return m[0], text[m.end():]

def normalized(text):
    return text.replace('\r\n', '\n').strip()

def map_notes(path, c):
    sheets = json.loads(run('read_xmind.mjs', {'action': 'read', 'path': str(path)}))
    result = {}
    def walk(n):
        tags = [s[8:] for s in n.get('labels', []) if s.startswith('article:')]
        if tags:
            if len(tags) != 1 or tags[0] in result:
                raise ValueError('Duplicate article labels in XMind')
            note = n.get('notes') or {}
            result[tags[0]] = (n['title'], note.get('content', note.get('plain', '')))
        for child in n.get('children', []):
            walk(child)
    for sheet in sheets:
        walk(sheet)
    if set(result) != {a['slug'] for a in c['articles']}:
        raise ValueError('XMind article labels changed/missing. Add or remove pages through catalog.json first.')
    return result

def layout_hash(path):
    sheets = json.loads(run('read_xmind.mjs', {'action': 'read', 'path': str(path)}))
    def shape(n):
        tags = n.get('labels', [])
        return {'title': n.get('title'), 'labels': tags, 'href': n.get('href'),
                'notes': None if any(s.startswith('article:') for s in tags) else n.get('notes'),
                'children': [shape(ch) for ch in n.get('children', [])]}
    return digest(json.dumps([shape(s) for s in sheets], sort_keys=True).encode())

def build_map(c, data, destination):
    byslug = {a['slug']: a for a in c['articles']}
    def nav(n):
        target = n.get('target', {}); slug = target.get('articleSlug')
        out = {'title': n['title'], 'children': [nav(ch) for ch in n.get('children', [])]}
        if slug in byslug:
            out['linkToTopic'] = byslug[slug]['title']
            out['notes'] = '导航入口；正文只在内容分类的对应词条 Note 中编辑。\n' + 'https://www.scholay.com/wiki/' + slug + ('#' + target['sectionId'] if target.get('sectionId') else '')
        elif slug:
            out['href'] = 'https://www.scholay.com/wiki/' + slug
        return out
    sheets = [{'title': '线上导航', 'rootTopic': {'title': 'Scholay Wiki · 线上导航',
               'structureClass': 'org.xmind.ui.logic.right', 'children': [nav(n) for n in c['navigation']]}}]
    for cat in c['categories']:
        children = []
        for a in c['articles']:
            if a['category'] != cat['slug']:
                continue
            _, body = split(data[a['slug']].decode())
            children.append({'title': a['title'], 'labels': ['article:' + a['slug']],
                             'notes': body, 'href': '../' + a['path']})
        sheets.append({'title': cat['title'], 'rootTopic': {'title': cat['title'],
                       'structureClass': 'org.xmind.ui.logic.right', 'children': children}})
    run('create_xmind.mjs', {'path': str(destination), 'format': 'xmind8', 'sheets': sheets})
    notes = map_notes(destination, c)
    for slug, raw in data.items():
        assert normalized(notes[slug][1]) == normalized(split(raw.decode())[1]), slug

def backup(paths):
    folder = ROOT / '.local/wiki-sync/backups' / str(time.time_ns())
    for p in paths:
        if p.exists():
            dst = folder / p.relative_to(ROOT)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dst)
    return folder

def save_state(c):
    dump(STATE, {'pages': {s: digest(b) for s, b in files(c).items()},
                 'map': digest(MAP.read_bytes()), 'catalog': digest(CAT.read_bytes()),
                 'layout': layout_hash(MAP)})

def perform(mode):
    c = catalog(); data = files(c)
    old = json.loads(STATE.read_text()) if STATE.exists() else None
    hashes = {s: digest(b) for s, b in data.items()}
    mh = digest(MAP.read_bytes()) if MAP.exists() else None
    md_changed = not old or hashes != old['pages'] or digest(CAT.read_bytes()) != old['catalog']
    xm_changed = bool(mh) and (not old or mh != old['map'])
    if mode == 'status':
        print(json.dumps({'articles': len(data), 'markdown_changed': md_changed,
              'xmind_changed': xm_changed, 'baseline': bool(old), 'map_exists': bool(mh)}, ensure_ascii=False))
        return
    if mode == 'verify':
        notes = map_notes(MAP, c)
        for slug, raw in data.items():
            assert normalized(notes[slug][1]) == normalized(split(raw.decode())[1]), slug
        print(f'Verified: {len(data)} page bodies match XMind Notes.')
        if not old:
            save_state(c)
        return
    if mode == 'auto':
        if md_changed and xm_changed:
            raise ValueError('Both sides changed. No files overwritten. Review both and use an explicit direction after resolving edits.')
        if not md_changed and not xm_changed:
            print('Already synchronized.'); return
        mode = 'from-xmind' if xm_changed else 'to-xmind'
    # Explicit direction is not permission to discard a changed destination.
    if mode == 'to-xmind' and xm_changed:
        raise ValueError('XMind has unimported edits or no baseline. Preserve/reconcile it before regeneration.')
    if mode == 'from-xmind' and md_changed:
        raise ValueError('Markdown/catalog changed or baseline missing. Reconcile before importing XMind.')
    if mode == 'to-xmind':
        temp = MAP.with_name('Scholay.pending.xmind')
        build_map(c, data, temp)
        backup([MAP, STATE]); temp.replace(MAP)
    elif mode == 'from-xmind':
        if layout_hash(MAP) != old['layout']:
            raise ValueError('XMind structure/navigation changed. No overwrite: reconcile catalog/navigation first. Only article Note edits import automatically.')
        notes = map_notes(MAP, c); updates = {}
        for a in c['articles']:
            slug = a['slug']; title, note = notes[slug]
            fm, body = split(data[slug].decode())
            if title != a['title']:
                raise ValueError(f'{slug}: rename titles in Markdown/catalog; node title is its stable display label.')
            if not re.match(r'^#\s+\S', note.lstrip()):
                raise ValueError(f'{slug}: keep the page H1 in its Note.')
            if normalized(note) != normalized(body):
                updates[ROOT / a['path']] = (fm + note.strip() + '\n').encode()
        backup([*updates, STATE])
        # All articles are validated before writing any page.
        for path, raw in updates.items():
            atomic(path, raw)
        print(f'Imported {len(updates)} changed page(s); unchanged files kept byte-for-byte.')
    save_state(c)
    print('Synchronized; backup retained under .local/wiki-sync/backups.')

def main():
    p = argparse.ArgumentParser(); p.add_argument('mode', choices=['status','verify','auto','to-xmind','from-xmind','watch'])
    args = p.parse_args()
    lock = ROOT / '.local/wiki-sync/lock'; lock.parent.mkdir(parents=True, exist_ok=True)
    import fcntl
    with lock.open('w') as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.mode != 'watch':
            perform(args.mode); return
        print('Watching saved files. Conflicting changes stop the watcher.', flush=True)
        while True:
            perform('auto'); time.sleep(2)

if __name__ == '__main__':
    raise SystemExit('Archived XMind tool: use tools/wiki/sync.py for Excalidraw. Do not overwrite current Markdown.')

    try:
        main()
    except (ValueError, AssertionError, subprocess.CalledProcessError) as e:
        raise SystemExit(str(e))
