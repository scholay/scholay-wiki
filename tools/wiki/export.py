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
    internal_slugs={a['slug'] for a in c['articles'] if a.get('internal')}
    def navlines(nodes, github=False, depth=0):
        result=[]
        for n in nodes:
            slug=n.get('target',{}).get('articleSlug')
            label=n['title']
            if slug in internal_slugs:
                continue
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
    public=[a for a in c['articles'] if not a.get('internal')]
    path_to_slug={(ROOT/a['path']).resolve():a['slug'] for a in public}
    for a in public:
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
    categories = [(category, [a for a in public if a['category'] == category['slug']])
                  for category in c['categories']]
    categories = [(category, articles) for category, articles in categories if articles]
    home = ['# Scholay · 研究者使用指南', '',
            '从发现文献到完成写作，找到适合你当前研究任务的工具与方法。', '',
            '[打开 Scholay](https://www.scholay.com/) · [官网文档](https://www.scholay.com/wiki/) · [全部词条](All-Pages)', '',
            '## 从这里开始', '',
            '| 发现与整理 | 分析与写作 |', '| --- | --- |',
            '| [检索学术文献](academic-search) · [查找期刊](journal-search-page) | [与 PDF 对话](pdf-chat-guide) · [智能审稿](peer-review) |',
            '| [管理文献库](literature-library) · [收集到暂存区](staging-area) | [Prism 写作](prism) · [Claw 智能助手](claw) |', '',
            '## 浏览主题', '', '| 主题 | 内容 |', '| --- | --- |']
    sidebar = ['**SCHOLAY / WIKI**', '', '[使用指南](Home) · [全部词条](All-Pages)', '', '### 主题导航', '']
    index = ['# 全部词条', '', '[返回首页](Home)', '']
    for category, articles in categories:
        title = category['title']
        dest = 'All-Pages#' + quote(github_anchor(title), safe='-')
        home.append(f"| [{title}]({dest}) | {category['description']} |")
        sidebar.append(f'- [{title}]({dest})')
        index += ['## ' + title, '', category['description'], '']
        index += [f"- [{a['title']}]({a['slug']})" for a in articles]
        index += ['']
    home += ['', '---', '', '[账户与登录](account) · [会员与定价](product-and-pricing-overview) · [反馈与支持](feedback-and-support)', '']
    sidebar += ['', '### 常用入口', '', '- [账户与登录](account)', '- [会员与定价](product-and-pricing-overview)', '- [反馈与支持](feedback-and-support)', '']
    (temp/'Home.md').write_text('\n'.join(home).rstrip() + '\n')
    (temp/'All-Pages.md').write_text('\n'.join(index).rstrip() + '\n')
    (temp/'_Sidebar.md').write_text('\n'.join(sidebar).rstrip() + '\n')
    (temp/'_Footer.md').write_text('Scholay · [官方网站](https://www.scholay.com/) · [官网文档](https://www.scholay.com/wiki/) · [内容源与贡献](https://github.com/scholay/scholay-wiki)\n')
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
    dump(ROOT/'build/github-wiki-receipt.json',{'remote':'git@github.com:scholay/scholay-wiki.wiki.git','published':False,
        'files':{str(p.relative_to(output)):digest(p.read_bytes()) for p in sorted(output.rglob('*')) if p.is_file()}})
    print(f'Exported {len(list(output.glob("*.md")))} Markdown files to {output}. No remote changes.')

if __name__=='__main__': main()
