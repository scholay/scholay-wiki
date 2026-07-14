---
name: library-reference
description: 用户从文献集「引用」的文献已物化到当前工作目录的 references/ 下。需要基于这些被引文献回答、对比、综述或引用时遵循本技能。
when_to_use: 当用户消息里出现「引用文献」块,或要求基于其引用的文献/某个文献集文件夹来回答、对比、综述、写作、给引用时。
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep
---

# 引用文献(来自用户文献集)

用户在输入框用「引用文献」选了自己文献集里的论文 / 整个文件夹。后台已把这些资料**物化到你当前工作目录的 `references/` 下**(无需联网即可读)。用户消息末尾的「引用文献」块只是给你的提示,真资料在文件里。

## 目录结构

```
references/
  INDEX.md            ← 先读这个:被引文献清单(单篇 + 文件夹分组,带相对链接、是否含 PDF)
  paper-<id>.md       ← 每篇的 metadata:标题/作者/年份/期刊/DOI/被引/摘要 + PDF 路径(若有)
  ref-<id>.pdf        ← 用户为该篇上传的 PDF 全文(仅部分论文有;路径写在对应 paper-<id>.md 里)
```

## 怎么用

1. **先 `Read references/INDEX.md`** 看用户引用了哪些文献、各自的文件、哪些带 PDF 全文。
2. 需要某篇细节时 `Read references/paper-<id>.md`(metadata + 摘要);要正文/数据/图表就 `Read` 它记录的 `ref-<id>.pdf`(PDF 你能原生解析)。
3. 文件夹引用 = INDEX 里的「文件夹『名字』」分组;大文件夹后台最多纳入 30 篇(INDEX 会标「共 N 篇,纳入最近 M 篇」),需要更多就提示用户拆分或单独引用。

## 约束

- **以这些被引文献为准**,不要凭标题臆测内容;要分析就 Read 对应文件 / PDF。
- 引用时给清晰出处(作者, 年份 + 标题),区分「用户上传 PDF 全文」与「仅元数据/摘要」——只有元数据时不要假装读过全文。
- metadata 里的字段可能是用户编辑过的(og 覆盖上游),按文件里写的为准。
- 没有 OA 全文、用户也没上传 PDF 时,只能基于摘要 + 元数据回答,并说明这一点;`pdf_url`(OA 直链)如确需正文可用 WebFetch 取(可能失败)。
