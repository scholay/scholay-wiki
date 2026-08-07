#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据分析 · 验收测试手册:一次性生成全部测试数据文件。

用法(在本目录 TESTCASES/ 下执行):
    python3 make_all_data.py                 # 产物落在 ./_data/
    python3 make_all_data.py -o ~/statlab    # 指定输出目录
    python3 make_all_data.py --only MED,AD   # 只生成某几批(前缀匹配用例号)
    python3 make_all_data.py --list          # 只列清单不执行

依赖:  numpy  pandas  scipy  openpyxl
        (AD-06(a) 另需 pyreadstat;缺了会自动跳过并提示,不影响其余用例)
        本机装不了依赖时,可以整目录丢进容器里跑(见 README 〇 的第 2 条命令)

原理:直接从同目录下 med.md / psy.md / sport.md / agri.md / adversarial.md 五份用例正文里
      逐字抽取 python 代码块并按顺序执行 —— 所以这个脚本永远不会和用例正文漂移;
      正文里改一个 seed,这里跑出来的就是改后的数据。
"""
import argparse
import contextlib
import io
import os
import re
import sys
import traceback
from pathlib import Path

BATCHES = [
    ("med.md",         "二 · 医学临床 / 公共卫生"),
    ("psy.md",         "三 · 心理学 / 教育学"),
    ("sport.md",       "四 · 体育科学 / 运动康复"),
    ("agri.md",        "五 · 农学 / 食品科学"),
    ("adversarial.md", "六 · 对抗性 / 边界 / 红线"),
]

CASE_RE = re.compile(r"^#{2,4}\s*用例\s*([A-Z]{2,3}-\d{2})")
FENCE_OPEN_RE = re.compile(r"^```python\s*$")
FENCE_CLOSE_RE = re.compile(r"^```\s*$")


def extract(md_path: Path):
    """返回 [(case_id, seq, code), ...],seq 是同一用例内的第几个 python 块(如 AD-06 有 a/b)。"""
    blocks, case, buf, in_code, seen = [], "(前言)", [], False, {}
    for line in md_path.read_text(encoding="utf-8").splitlines():
        if in_code:
            if FENCE_CLOSE_RE.match(line):
                in_code = False
                seen[case] = seen.get(case, 0) + 1
                blocks.append((case, seen[case], "\n".join(buf)))
                buf = []
            else:
                buf.append(line)
            continue
        m = CASE_RE.match(line)
        if m:
            case = m.group(1)
        elif FENCE_OPEN_RE.match(line):
            in_code = True
    return blocks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default="_data", help="输出目录(默认 ./_data)")
    ap.add_argument("--only", default="", help="逗号分隔的用例号前缀,如 MED,AD")
    ap.add_argument("--list", action="store_true", help="只列清单,不执行")
    ap.add_argument("-v", "--verbose", action="store_true", help="打印每个脚本自己的 stdout(自检段)")
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    prefixes = [p.strip().upper() for p in args.only.split(",") if p.strip()]

    todo = []
    for bi, (fname, title) in enumerate(BATCHES):
        md = here / fname
        if not md.exists():
            print(f"!! 找不到 {md},跳过", file=sys.stderr)
            continue
        for case, seq, code in extract(md):
            if prefixes and not any(case.startswith(p) for p in prefixes):
                continue
            todo.append((bi, title, case, seq, code))

    if args.list:
        for _, title, case, seq, _ in todo:
            print(f"{title:26s} {case}{'' if seq == 1 else f'({seq})'}")
        print(f"\n共 {len(todo)} 段生成脚本")
        return

    print(f"输出目录: {out}\n")
    made, failed, skipped, noop = [], [], [], []
    cwd0 = os.getcwd()
    os.chdir(out)
    try:
        for bi, title, case, seq, code in todo:
            tag = case if seq == 1 else f"{case}({chr(96 + seq)})"
            before = set(os.listdir("."))
            cap = io.StringIO()
            try:
                g = {"__name__": "__main__", "__file__": f"{tag}.py"}
                with contextlib.redirect_stdout(cap):
                    exec(compile(code, f"<{tag}>", "exec"), g)
            except ModuleNotFoundError as e:
                skipped.append((tag, e.name))
                print(f"  ~  {tag:10s} 跳过:本机缺 {e.name}(不影响其余用例)")
                continue
            except Exception:
                failed.append((tag, traceback.format_exc().strip().splitlines()[-1]))
                print(f"  ✗  {tag:10s} 失败:{failed[-1][1]}")
                continue
            new = sorted(set(os.listdir(".")) - before)
            if new:
                for f in new:
                    made.append((bi, f, tag, title))
                print(f"  ✓  {tag:10s} → {', '.join(new)}")
            else:
                noop.append(tag)
                print(f"  ·  {tag:10s} (复用其它用例的数据,无新文件)")
            if args.verbose and cap.getvalue().strip():
                for ln in cap.getvalue().strip().splitlines():
                    print(f"        | {ln}")

        # AD-06(b):用例正文里是 bash 块,这里补上(只测上传闸,不测内容)
        fake = Path("AD06_fake.sav")
        if not fake.exists():
            fake.write_bytes(os.urandom(200_000))
            made.append((4, fake.name, "AD-06(b)", "六 · 对抗性 / 边界 / 红线"))
            print(f"  ✓  AD-06(b)   → {fake.name}")
    finally:
        os.chdir(cwd0)

    print("\n" + "=" * 78)
    print("文件 → 用例 对照表(上传时照这张表找文件)")
    print("=" * 78)
    w = max(len(f) for _, f, _, _ in made) if made else 30
    last = None
    for _, f, tag, title in sorted(made, key=lambda x: (x[0], x[2], x[1])):
        if title != last:
            print(f"\n【{title}】")
            last = title
        print(f"  {f:<{w}}  →  {tag}")
    print(f"\n共 {len(made)} 个数据文件,{len(todo)} 段脚本。")
    if noop:
        print(f"无新文件(按设计复用他人数据): {', '.join(noop)}")
    if skipped:
        print("\n本机环境缺依赖而跳过(按设计允许):")
        for tag, mod in skipped:
            print(f"  {tag}: pip install {mod} 后重跑本条即可")
    if failed:
        print("\n失败(这就是 bug,不是设计):")
        for tag, why in failed:
            print(f"  {tag}: {why}")
        sys.exit(1)


if __name__ == "__main__":
    main()
