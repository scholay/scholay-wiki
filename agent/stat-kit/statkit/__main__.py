"""statkit CLI —— `python3 -m statkit <verb>`。

## 为什么是 CLI 而不是 executor 工具

数据受 PHI 约束**不能出 jail**,而 jail 内唯一的执行通道是 Bash。
引擎打成 pip 包装进 `/usr/local/lib/python3*/dist-packages`,已被
`agent/src/sandbox/bwrap.ts` 的 `--ro-bind /usr /usr` 覆盖(lifelines 是活证据),
故 `bwrap.ts` 与 `registry.ts` 的 `bashEnv()` **都零改动**。

对比 BuildDeck:它必须是 executor 工具,因为 node_modules 不进 jail。方向正好相反。

## 输出契约(所有 verb 共同遵守)

- stdout **只出 JSON**(≤8KB;超长写文件回传路径),便于模型直接解析;
- 退出码:0 正常 / 2 守门拒绝或注册表不合格 / 3 partial(算了一部分,可续跑)/ 1 引擎自身异常。
  **2 与 1 必须可区分**:前者是「按设计拒绝你」,后者是「我坏了」,模型的应对完全不同。
- 错误信息面向模型**可行动** —— 直接说清缺什么、候选是什么、下一步该调什么。
  打哑谜会让模型重试到 24 轮上限耗尽。
"""

from __future__ import annotations

import json
import sys

USAGE = """statkit —— Scholay 数据分析引擎

  python3 -m statkit doctor [--json] [--strict]
      注册表自检:卡片能否加载、出处是否可及、golden 是否非空、缺库方法是否被列出。

  python3 -m statkit assume --facts '<json>' [--requested <method_id>]
      前提实测 + 决策表分流,产出候选白名单 allowed[] / 默认 chosen / 依据链。

  python3 -m statkit run --data <file> --dv <列> --group <列> [--paired --subject <列>] [--requested <method_id>]
      读数据 → 实测前提 → 守门分流 → 计算 → 落 analysis/<hash>.bundle.json。
      stdout 只回摘要,原始数据行永不出现(上下文预算 + PHI 边界)。

  python3 -m statkit report --bundle <path> --system <cn-core|apa> [--workdir .]
      从 bundle 渲染三线表 docx + Methods 段 + Results 段。换体系 = 重跑本 verb,零重算。

  python3 -m statkit numcheck [--workdir .]
      交付闸取证:扫 out/ 里的交付物,检查每个数字能否在 analysis/*.bundle.json 里找到源。
      **默认 observe 只记录不拦**(匹配是启发式,先采假阳性率);STATKIT_NUMCHECK_ENFORCE=1 开硬拦。

  python3 -m statkit vocabulary [--json]
      打印派生事实词表(决策规则 `when` 唯一能引用的名字空间)。

  python3 -m statkit situations [--json] [--id <reason>] [--severity <档>]
      **情况目录 —— 引擎会遇到的每一种状况的说明书**。
      每张卡回答五件事:是什么 / 怎么判定的 / 不管它会怎样 / 下一步做什么 / 坚持继续会怎样。
      三档:
        blocking    算术上不可能(分母为 0、n<3、读不进来)—— 不归你决定,但回执会说清怎么修
        capability  引擎没实现这个方法族 —— **我们的缺口**;给替代路径,别用错方法凑合
        advisory    能算但结论可疑 —— **归你决定**:引擎给全证据与后果,你选择继续或调整;
                    选择继续要显式传 accept 参数,该决定会被写进 Methods 段披露给审稿人
"""


def _opt(args: list[str], name: str) -> str:
    """取 `--name <value>` 的值;没有就回空串。"""
    if name in args:
        i = args.index(name)
        if i + 1 < len(args) and not args[i + 1].startswith("--"):
            return args[i + 1]
    return ""


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in ("-h", "--help", "help"):
        sys.stdout.write(USAGE)
        return 0

    verb, rest = args[0], args[1:]

    if verb == "doctor":
        from .verbs.doctor import run_doctor

        code, out = run_doctor(as_json="--json" in rest, strict="--strict" in rest)
        sys.stdout.write(out + "\n")
        return code

    if verb == "assume":
        from .verbs.assume import cli as assume_cli

        code, out = assume_cli(rest)
        sys.stdout.write(out + "\n")
        return code

    if verb == "run":
        from .verbs.run import cli as run_cli

        code, out = run_cli(rest)
        sys.stdout.write(out + "\n")
        return code

    if verb == "report":
        from .verbs.report import cli as report_cli

        code, out = report_cli(rest)
        sys.stdout.write(out + "\n")
        return code

    if verb == "numcheck":
        from .verbs.numcheck import cli as numcheck_cli

        code, out = numcheck_cli(rest)
        sys.stdout.write(out + "\n")
        return code

    if verb == "situations":
        from .situations import CATALOG, as_json

        sid = _opt(args, "--id")
        sev = _opt(args, "--severity")
        rows = as_json()
        if sid:
            rows = [r for r in rows if r["id"] == sid]
            if not rows:
                sys.stderr.write(f"没有 id 为 {sid!r} 的情况;全部 id:{sorted(CATALOG)}\n")
                return 2
        if sev:
            rows = [r for r in rows if r["severity"] == sev]
        if "--json" in args:
            sys.stdout.write(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
            return 0
        for r in rows:
            sys.stdout.write(f"\n[{r['severity']}] {r['id']} —— {r['title_zh']}\n")
            sys.stdout.write(f"  是什么      {r['meaning_zh']}\n")
            sys.stdout.write(f"  判据        {r['detect_zh']}\n")
            sys.stdout.write(f"  不管会怎样  {r['impact_zh']}\n")
            sys.stdout.write(f"  下一步      {r['next_zh']}\n")
            if r.get("if_proceed_zh"):
                sys.stdout.write(f"  坚持继续    {r['if_proceed_zh']}\n")
                sys.stdout.write(f"  放行参数    {r['accept_key']}(该决定会被写进 Methods 披露)\n")
        return 0

    if verb == "vocabulary":
        from .core.facts import VOCABULARY

        if "--json" in rest:
            sys.stdout.write(
                json.dumps(
                    [
                        {
                            "name": f.name,
                            "kind": f.kind,
                            "desc_zh": f.desc_zh,
                            "source": f.source,
                            "introduced_by": f.introduced_by,
                        }
                        for f in VOCABULARY
                    ],
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n"
            )
        else:
            for f in VOCABULARY:
                sys.stdout.write(
                    f"{f.name:18s} {f.kind:7s} {f.source:8s} {f.desc_zh}  ← {f.introduced_by}\n"
                )
        return 0

    sys.stdout.write(
        json.dumps(
            {"ok": False, "reason": "unknown_verb", "verb": verb,
             "hint_zh": "可用 verb:doctor / assume / run / report / numcheck / vocabulary"},
            ensure_ascii=False,
        )
        + "\n"
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
