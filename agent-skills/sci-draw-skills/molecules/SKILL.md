---
name: molecules
description: 用 RDKit 从 SMILES/化学标识符确定性地渲染 2D 分子结构图(药物/小分子/反应式),输出可编辑 SVG,零幻觉。当用户要"画分子结构/化学结构式/某个药物/某个化合物"时遵循本技能。
when_to_use: 当用户要画分子/化学结构式(给了 SMILES、化合物名、或明确结构),或药物/小分子/反应式的结构图时。
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# 科研绘图 · 分子结构图(RDKit)

分子结构**绝不手画、也绝不凭记忆生成**:化学结构对错是硬真值,模型手画必然出错。你用 **RDKit** 从
**SMILES/明确结构**确定性地渲染 2D 结构图,存成**可编辑 SVG** 到 `./out/`。同一 SMILES 出同一张图,零幻觉。

## 铁律(不可违反)

1. **结构必须来自用户/权威**:用户给 SMILES 或明确的结构定义才画。给了化合物**名称**但没 SMILES 时——
   **不要凭记忆猜 SMILES**(容易记错原子/键/立体化学)。请用户提供 SMILES/InChI,或明确确认结构。运行期断网,
   查不了数据库;拿不准就问。
2. **不伪造结构**:RDKit 解析失败(`MolFromSmiles` 返回 None)说明 SMILES 有误 —— 报告给用户让其核对,别硬画一个近似的。
3. **可复现**:图完全由 SMILES + 脚本决定。脚本可留在 `./out/` 便于复算。

## 环境(容器已装,直接用)

- python3 + rdkit 已在镜像内(`from rdkit import Chem`)。运行期断网,不要 pip 装包。
- 出 SVG 用 `rdkit.Chem.Draw.rdMolDraw2D.MolDraw2DSVG`(矢量、可编辑)。

## 最小范式(2D 单分子 → SVG)

```python
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D

smiles = "CC(=O)Oc1ccccc1C(=O)O"   # 阿司匹林(示例;实际用用户给的 SMILES)
mol = Chem.MolFromSmiles(smiles)
if mol is None:
    raise SystemExit("SMILES 解析失败,请核对结构")
AllChem.Compute2DCoords(mol)        # 规范 2D 排布
d = rdMolDraw2D.MolDraw2DSVG(500, 400)
d.drawOptions().addStereoAnnotation = True   # 标注立体化学(如有)
rdMolDraw2D.PrepareAndDrawMolecule(d, mol)
d.FinishDrawing()
open("out/aspirin.svg", "w").write(d.GetDrawingText())
```

用 **Bash** 跑 `python3 out/<名字>.py`;报错就改脚本再跑到成功。

## 能力

- **单分子**:SMILES → 结构图,带/不带原子编号、立体标注、局部高亮(`highlightAtoms`)。
- **多分子网格**:`Chem.Draw.MolsToGridImage(...)` 或多个 `MolDraw2DSVG` 拼版,给一组类似物/衍生物对比。
- **反应式**:`Chem.AllChem.ReactionFromSmarts(rxn_smarts, useSmiles=True)` + `rdMolDraw2D.MolDraw2DSVG(...).DrawReaction(...)` 画反应物→产物。
- **子结构高亮**:`mol.GetSubstructMatch(Chem.MolFromSmarts(...))` 标出官能团/骨架。

## 画法与交付

- 画布尺寸给足(单分子 ~500×400,复杂分子更大),别让结构挤成一团;必要时 `d.drawOptions().bondLineWidth` / 字号微调。
- 需要标题/图注就在 SVG 外层包一层(或用 `MolsToGridImage` 的 legends)。
- 产物 `./out/<名字>.svg`(主交付)+ 可选 `.py`;自包含、不引外链。
- 简述你画的是什么分子(可回述 SMILES 供用户核对),提醒投稿按目标期刊 AI 政策披露。
