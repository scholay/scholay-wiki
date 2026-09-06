#!/usr/bin/env python3
"""Build Obsidian indexes and a reviewable, local GitHub Wiki mirror. Never push."""
import argparse, json, os, pathlib, re, shutil, subprocess, tempfile
from urllib.parse import unquote, urlsplit, quote
from sync import ROOT, catalog, split, dump, digest

def github_anchor(s):
    return re.sub(r'[^\w\-\s]', '', s.lower()).replace(' ', '-')

def main():
    p = argparse.ArgumentParser(); p.add_argument('--github', action='store_true'); args=p.parse_args()
    c=catalog(); by={a['slug']:a for a in c['articles']}
    def navlines(nodes, github=False, depth=0):
        result=[]
        for n in nodes:
            slug=n.get('target',{}).get('articleSlug')
            label=n['title']
            if slug in by:
                dest=slug if github else os.path.relpath(ROOT/by[slug]['path'],ROOT/'wiki')
                label=f'[{label}]({dest})'
            result.append('  '*depth+'- '+label)
            result.extend(navlines(n.get('children',[]),github,depth+1))
        return result
    nav='# 线上导航\n\n按 2026-09-06 线上 Wiki 导航顺序组织。正文每篇只维护一份。\n\n'+'\n'.join(navlines(c['navigation']))+'\n'
    (ROOT/'wiki/导航.md').write_text(nav)
    lines=['# 词条索引','','[按线上导航浏览](导航.md) · [维护说明](开始.md)','']
    for category in c['categories']:
        lines += ['## '+category['title'],'',category['description'],'']
        lines += [f"- [{a['title']}]({os.path.relpath(ROOT/a['path'],ROOT/'wiki')})" for a in c['articles'] if a['category']==category['slug']]
        lines += ['']
    (ROOT/'wiki/索引.md').write_text('\n'.join(lines))
    if not args.github:
        print('Updated Obsidian navigation and category index.'); return
    subprocess.run(['python3',str(ROOT/'tools/wiki/sync.py'),'verify'],check=True)
    output=ROOT/'build/github-wiki'
    output.parent.mkdir(exist_ok=True)
    temp=pathlib.Path(tempfile.mkdtemp(prefix='wiki-export-',dir=output.parent))
    path_to_slug={(ROOT/a['path']).resolve():a['slug'] for a in c['articles']}
    for a in c['articles']:
        source=ROOT/a['path']; _,body=split(source.read_text())
        def link(m):
            raw=m[1]; u=urlsplit(raw)
            if u.scheme or raw.startswith('//') or not u.path:
                return m[0]
            target=(source.parent/unquote(u.path)).resolve()
            if target in path_to_slug:
                dest=path_to_slug[target]
                if u.fragment: dest+='#'+quote(github_anchor(unquote(u.fragment)),safe='-')
                return ']('+dest+')'
            if target == ROOT/'wiki/索引.md': return '](Home)'
            if target.exists():
                # Copy only explicitly referenced repo assets, preserving a unique repo path.
                rel=target.relative_to(ROOT)
                dst=temp/'assets'/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,dst)
                return '](assets/'+rel.as_posix()+')'
            raise ValueError(f'Unresolved relative link in {a["slug"]}: {raw}')
        body=re.sub(r'\]\(([^\s)]+)\)',link,body)
        (temp/(a['slug']+'.md')).write_text(body)
    home=['# Scholay Wiki','','本镜像由 scholay/scholay 主仓库的 wiki/pages 内容生成。请在主仓库维护正文，再同步至此。','','## 导航','']+navlines(c['navigation'],True)+['','## 全部词条','']
    for category in c['categories']:
        home += ['### '+category['title'],'']
        home += [f"- [{a['title']}]({a['slug']})" for a in c['articles'] if a['category']==category['slug']]
        home += ['']
    (temp/'Home.md').write_text('\n'.join(home))
    (temp/'_Sidebar.md').write_text('[首页](Home)\n\n'+'\n'.join(navlines(c['navigation'],True))+'\n')
    (temp/'_Footer.md').write_text('内容源：[scholay/scholay](https://github.com/scholay/scholay) · [官方网站 Wiki](https://www.scholay.com/wiki/)\n')
    # Validate every local Markdown page link before replacing the prior build.
    for file in temp.glob('*.md'):
        for url in re.findall(r'\]\(([^\s)]+)\)',file.read_text()):
            u=urlsplit(url)
            if u.scheme or url.startswith(('#','//')): continue
            target=temp/unquote(u.path)
            if not target.exists() and not target.with_suffix('.md').exists():
                raise ValueError(f'Broken Wiki link: {file.name}: {url}')
    if output.exists(): shutil.rmtree(output)
    temp.replace(output)
    dump(ROOT/'build/github-wiki-receipt.json',{'remote':'git@github.com:scholay/scholay.wiki.git','published':False,
        'files':{str(p.relative_to(output)):digest(p.read_bytes()) for p in sorted(output.rglob('*')) if p.is_file()}})
    print(f'Exported {len(list(output.glob("*.md")))} Markdown files to {output}. No remote changes.')

if __name__=='__main__': main()
