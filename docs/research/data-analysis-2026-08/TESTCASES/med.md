## 医学临床 / 公共卫生 —— 「数据分析」P0 验收用例

> 取材:`raw/A1-医学临床公卫护理.md`(§2.1 自采临床回顾性数据的脏点清单、§5.1 中文列名与缺失编码、
> §5.3 Levene 之后的三条分叉、§7.3 t 检验三类误用、§7.4 NHANES 公式化论文红线、§6 交付物排序)。
> 每条用例的数据脚本都已在 `scholar_agent` 容器内实跑验证(numpy 2.2.4 / pandas 2.2.3 / scipy 1.15.3),
> 下文写出的前提检验 p 值、统计量、效应量都是**实跑结果**,不是估计值 —— 引擎算出来对不上就是 bug。

### 跑之前

```bash
pip install numpy pandas scipy openpyxl        # 或 docker exec -i scholar_agent python3 - < 脚本
```
脚本在当前目录生成数据文件,直接上传到「数据分析」卡片。每个脚本末尾的 `=== 自检 ===` 段
**只是给测试者对答案用的**,不属于被测系统;引擎的输出必须与它一致(p 值末位差异容忍到 1e-3 相对误差)。

### 全用例通用的判 bug 项(每条都要看,下面各用例不再重复)

| # | 一眼判定 | 说明 |
|---|---|---|
| G1 | 交付物里出现 `999`、`未评`、`>60`、`未测` 参与了运算(表现:均值/SD 大到离谱,如前白蛋白均值 >250 mg/L) | 缺失编码没被识别 |
| G2 | 三线表脚注 / Methods 段**没有**写清缺失值如何处理、剔除了几例 | §7.1「improperly addressing missing data」是审稿人第 4 类高频问题 |
| G3 | 依据链里没有前提检验的**具体数值**(只写「符合正态」不给 Shapiro W 与 p) | 依据链不可核对 = 等于没有 |
| G4 | `cn-core` 与 `apa` 两套产物在**数值上**不一致(不是格式差异,是 p 或均值本身不同) | 同一次拟合两种排版,数值必须逐位相同 |
| G5 | `apa` 产物里 p 写成 `p = 0.004`(带前导零),或 `cn-core` 写成 `p = .004`(无前导零) | 体系切换没生效 |
| G6 | Results 段出现「有差异 / 无差异」而不是「差异有(无)统计学意义」 | A1 §7.3 第 1 条,中文期刊编辑点名的高频错误 |
| G7 | 输出里出现 P0 未实现的方法名(ANOVA / 事后检验 / logistic / Cox / ROC / FDR 校正)且**声称已算出结果** | 编数据,最严重的一类 |
| G8 | 引擎在信息不足时自行猜测(分组怎么合并、配对与否、`>60` 怎么处理)而不问 | 「不猜」是守门硬要求 |

---

### 用例 MED-01 · 胃癌根治术 ERAS 路径 vs 传统路径的术后第 3 天前白蛋白(D-01 基准路径 + 分组变量六种写法)

**学科与场景**
某三甲医院普外科的临床专硕做回顾性队列:2024 年 1 月—2024 年 12 月连续收治的胃癌根治术患者,
按术后是否进入 ERAS(加速康复外科)路径分两组,比较术后第 3 天血清前白蛋白(营养恢复的敏感指标,半衰期 2 天)。
数据是他自己从 HIS 里逐份病历抄进 Excel 的(A1 §2.1「自采临床回顾性数据」典型形态),
n 一百出头 —— 这是单中心单术式一年的真实收治量,不是设计出来的样本量。
分组列是不同轮转的规培医生分批录的,同一个组被写成三种叫法。

**数据**
n = 58(ERAS)/ 55(对照),清洗后 52 / 53。变量:住院号(文本、有前导零)、手术日期(Excel 存成序列号整数)、
分组、年龄、术后第 3 天前白蛋白(mg/L)、备注(整列空)。
脏点:① 列名带空格与全角括号「术后第3天 前白蛋白 (mg/L)」;② 分组列 6 种写法(ERAS / ERAS组 / 快速康复 / 对照 / 对照组 / control);
③ 化验未做的 8 例填 `999`;④ 「备注」是整列空的多余列;⑤ 手术日期是 45200~45560 的裸数字。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-01 数据生成。为什么这份数据必然命中 D-01:
  1) 两组是不同患者 → 独立;前白蛋白是连续计量资料
  2) 两组均由正态分布生成,清洗后逐组 Shapiro-Wilk p = 0.960 / 0.751,远大于 .05 → 正态前提成立
  3) 两组 SD 设为 25 / 26(总体方差比 1.08),实测 Levene(center='median') p = 0.817 → 方差齐,
     故不落入 D-03
  4) 剔除 999 后 n = 52 / 53,两组均 ≥30 → 不落入 D-02 的 min(n)<30 分支
  ⇒ 独立 + 连续 + 正态 + 方差齐 + n≥30 = D-01,默认 student_t
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260805)
n_e, n_c = 58, 55
eras = rng.normal(198.0, 25.0, n_e)
ctrl = rng.normal(182.0, 26.0, n_c)
grp_e = rng.choice(["ERAS", "ERAS组", "快速康复"], n_e, p=[.5, .3, .2])
grp_c = rng.choice(["对照", "对照组", "control"], n_c, p=[.4, .4, .2])

df = pd.DataFrame({
    "住院号": [f"{i:08d}" for i in rng.integers(1_000_000, 9_999_999, n_e + n_c)],
    "手术 日期": rng.integers(45200, 45560, n_e + n_c),          # Excel 日期被存成序列号
    "分组": np.concatenate([grp_e, grp_c]),
    "年龄(岁)": rng.integers(41, 79, n_e + n_c),
    "术后第3天 前白蛋白 (mg/L)": np.concatenate([eras, ctrl]).round(1),
    "备注": [""] * (n_e + n_c),                                  # 多余空列
})
df.loc[rng.choice(n_e + n_c, 8, replace=False), "术后第3天 前白蛋白 (mg/L)"] = 999  # 未做化验
df = df.sample(frac=1, random_state=7).reset_index(drop=True)
df.to_excel("med01_eras_prealbumin.xlsx", index=False)

# === 自检(不属于被测系统) ===
from scipy import stats
v = df["术后第3天 前白蛋白 (mg/L)"]
a = v[df["分组"].isin(["ERAS", "ERAS组", "快速康复"]) & (v != 999)]
b = v[df["分组"].isin(["对照", "对照组", "control"]) & (v != 999)]
print("n", len(a), len(b), "| mean", round(a.mean(), 1), round(b.mean(), 1),
      "| sd", round(a.std(ddof=1), 2), round(b.std(ddof=1), 2))
print("shapiro", stats.shapiro(a).pvalue, stats.shapiro(b).pvalue)
print("levene(median)", stats.levene(a, b, center="median").pvalue)
print("student_t", stats.ttest_ind(a, b, equal_var=True))
```

自检输出:`n 52 53 | mean 197.1 182.0 | sd 25.80 27.36` · `shapiro 0.960 / 0.751` ·
`levene 0.817` · `t(103) = 2.916, p = 0.004355`。

**用户会怎么说**

> 传个表,胃癌根治术的,我们科去年一年的。ERAS 组和对照组术后第三天的前白蛋白想比一下,看有没有差异。
> 分组那一列是几个师弟分别录的,写得有点乱。急,导师明天要看。

**期望行为**
1. **问诊(不能猜)**:必须回问「分组列有 6 个不同取值 —— ERAS / ERAS组 / 快速康复 / 对照 / 对照组 / control,
   是否合并为 2 组?按什么合并?」以及「前白蛋白列有 8 个 999,是缺失编码还是真值?」。
   两个问题都必须问,合并规则由用户确认后才动手。「备注」空列、日期序列号可以自行忽略但要在清洗回执里列出。
2. **命中 D-01**:两组独立、连续、逐组 Shapiro p ≥ .05、Levene p ≥ .05、两组 n ≥ 30。
3. **检验**:`student_t`(双侧)。
4. **依据链应出现**:清洗回执(6 取值→2 组的映射表、8 例 999 按缺失剔除、终 n = 52/53)→
   Shapiro-Wilk 逐组 W 与 p(0.960 / 0.751)→ Levene(center = median)p = 0.817 →
   规则 ID `D-01` →`student_t` → 效应量 Cohen's d ≈ 0.57 / Hedges' g ≈ 0.56,95%CI 用非中心 t 求得(应大致覆盖 0.18~0.96)。
5. **交付物**:
   - 三线表 .docx:两列(ERAS / 对照)+ 统计量列 + P 列;`cn-core` 写 `197.1±25.8` / `182.0±27.4`,`P = 0.004`;
     `apa` 写 `197.10 (25.80)`,`t(103) = 2.92, p = .004, g = 0.56, 95% CI [0.18, 0.96]`。
   - Methods:「符合正态分布的计量资料以 x̄±s 表示,两组间比较采用两独立样本 t 检验;
     方差齐性以 Levene 检验判定(P = 0.817);以双侧 P<0.05 为差异有统计学意义。」
   - Results:「ERAS 组术后第 3 天前白蛋白高于对照组(197.1±25.8 vs 182.0±27.4 mg/L),差异有统计学意义(P = 0.004)。」

**判 bug 的依据**
- ⛔ 未问分组如何合并,自己把 6 个取值当 6 组、或只挑「ERAS」和「对照」两个字面值算(表现:终 n 明显小于 52/53,如 29/22)。
- ⛔ 终 n 不是 52 / 53(999 未剔或多剔)。
- ⛔ 均值不是 197.1 / 182.0(±0.1);SD 不是 25.8 / 27.4。
- ⛔ 选了 `welch_t`(表现:df 是 100.x 之类的小数)。Levene p = 0.817,此处走 Welch 属规则误判。
- ⛔ 选了 `mann_whitney`(表现:表里是 M(P25,P75) 而不是 x̄±s)。
- ⛔ 三线表把「手术 日期」当成一个待比较的连续变量出现在表里。
- ⛔ `apa` 表里出现 `x̄±s` 记法,或 `cn-core` 表里出现 `M (SD)`。
- ⛔ 效应量只给点估计不给 95%CI。

---

### 用例 MED-02 · 急性缺血性卒中血管内治疗 vs 静脉溶栓的 24h NIHSS 改善值(D-03 方差不齐)

**学科与场景**
神经内科卒中中心的回顾性登记研究。前循环大血管闭塞患者,一部分接受血管内治疗(取栓),
一部分只做静脉溶栓,比较 24 小时时 NIHSS 评分较基线的改善值。
临床上这是**方差必然不齐的经典场景**:取栓组的疗效取决于是否成功再通,成功者改善十几分、失败者几乎不改善甚至恶化,
个体差异极大;溶栓组疗效温和且集中。A1 §5.3 说得很明白 —— 用户卡在「Levene P<0.05 之后该走哪条分叉」,
且没人告诉他论文里那句方法学描述怎么写。数据由住院医师从卒中登记表导出。

**数据**
n = 42(血管内治疗)/ 45(静脉溶栓),清洗后 38 / 43。变量:住院号、发病至到院时间(h)、治疗方式、基线 NIHSS、24h NIHSS 改善值(分)。
脏点:① 3 例填 `999`;② 2 例填「未评」(死亡/转出未评估,文字混进数值列);
③ 1 例填 `66`(NIHSS 满分 42,改善值 66 是明显录入错误,**不是**统计学离群点);
④ 改善值有负数(病情恶化,真实数据,不得当异常剔除);⑤ 列名带空格。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-02 数据生成。为什么这份数据必然命中 D-03:
  1) 两组是不同患者 → 独立;NIHSS 改善值是连续计量资料
  2) 两组 SD 设为 6.0 / 2.1(总体方差比 ≈8),清洗(剔 999/未评/录入错误 66)后实测
     SD = 5.32 / 1.89,方差比 7.94,Levene(center='median') p = 4.5e-06 → 方差**明确不齐**
  3) 两组均正态(剔 66 后 Shapiro p = 0.752 / 0.112),n = 38 / 43 均 ≥30 → 不落 D-02
  ⇒ 独立 + 连续 + 方差不齐 = D-03,默认 welch_t
  ※ 若引擎没识别出 66 是录入错误而保留它,Levene p = 5.8e-03 仍 <.05,规则仍为 D-03 —— 
     所以「选 welch」这一点是鲁棒的,但描述统计会被 66 污染(见判 bug 项)
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260812)
n_evt, n_ivt = 42, 45
evt = rng.normal(6.5, 6.0, n_evt)     # 取栓:再通成功/失败两极 → 变异大
ivt = rng.normal(3.8, 2.1, n_ivt)     # 溶栓:疗效温和且集中

df = pd.DataFrame({
    "住院号": [f"{i:08d}" for i in rng.integers(2_000_000, 2_999_999, n_evt + n_ivt)],
    "发病至 到院时间(h)": np.round(rng.uniform(0.5, 5.5, n_evt + n_ivt), 1),
    "治疗方式": ["血管内治疗"] * n_evt + ["静脉溶栓"] * n_ivt,
    "基线 NIHSS": rng.integers(8, 25, n_evt + n_ivt),
    "24h NIHSS 改善值 (分)": np.concatenate([evt, ivt]).round(0).astype(object),
})
df.loc[[4, 17, 55], "24h NIHSS 改善值 (分)"] = 999     # 缺失编码
df.loc[[9, 61], "24h NIHSS 改善值 (分)"] = "未评"       # 文字混进数值列
df.loc[[23], "24h NIHSS 改善值 (分)"] = 66             # 越界录入错误(NIHSS 满分 42)
df = df.sample(frac=1, random_state=11).reset_index(drop=True)
df.to_excel("med02_stroke_nihss.xlsx", index=False)

# === 自检 ===
from scipy import stats
num = pd.to_numeric(df["24h NIHSS 改善值 (分)"], errors="coerce")
ok = num.notna() & (num != 999) & (num != 66)
a = num[(df["治疗方式"] == "血管内治疗") & ok].to_numpy()
b = num[(df["治疗方式"] == "静脉溶栓") & ok].to_numpy()
print("n", len(a), len(b), "| mean", round(a.mean(), 2), round(b.mean(), 2),
      "| sd", round(a.std(ddof=1), 2), round(b.std(ddof=1), 2),
      "| var ratio", round(a.var(ddof=1) / b.var(ddof=1), 2))
print("shapiro", stats.shapiro(a).pvalue, stats.shapiro(b).pvalue)
print("levene(median)", stats.levene(a, b, center="median").pvalue)
print("welch  ", stats.ttest_ind(a, b, equal_var=False))
print("student(错误分叉)", stats.ttest_ind(a, b, equal_var=True))
```

自检输出(剔 66):`n 38 43 | mean 7.21 4.16 | sd 5.32 1.89 | var ratio 7.94` ·
`shapiro 0.752 / 0.112` · `levene 4.52e-06` · `Welch t = 3.348, df = 45.20, p = 0.001647` ·
`student t = 3.515, df = 79, p = 0.000732`。

**用户会怎么说**

> 取栓组和溶栓组,24 小时 NIHSS 改善多少,想比一下。
> 上次我自己用 SPSS 跑,Levene 那一栏 P 很小,教程说这时候要看下面那一行「不假定方差齐」,
> 但我不知道论文的方法里该怎么写这句话,而且审稿人要是问起来我不知道怎么答。

**期望行为**
1. **问诊**:必须问 ① `999` / 「未评」是不是缺失;② **`66` 这个值** —— 明确指出 NIHSS 量表满分 42,
   改善值不可能为 66,询问是录入错误还是别的含义,**不得自行删除、也不得自行保留而不声明**;
   ③ 确认改善值的负数是真实的病情恶化(应保留)。
2. **命中 D-03**:Levene(center = median)p = 4.5e-06 < .05 → 方差不齐。
3. **检验**:`welch_t`(双侧)。**t = 3.348,df = 45.20(非整数),p = 0.0016。**
4. **依据链应出现**:清洗回执(剔 3 例 999 + 2 例未评 + 1 例越界值,终 n = 38/43)→
   Shapiro 逐组 p(0.752 / 0.112)→ Levene p = 4.52e-06 → **两组 SD 5.32 vs 1.89、方差比 7.94** →
   规则 ID `D-03` → `welch_t` + Welch-Satterthwaite 校正自由度 45.20 →
   效应量 Hedges' g,并**显式声明用的是合并 SD 还是分组 SD**(方差不齐时这是必须交代的)。
5. **交付物**:
   - Methods 段必须包含这句意思:「两组方差不齐(Levene 检验 P<0.001),组间比较采用校正自由度的 Welch t 检验」——
     这正是用户说的「不知道怎么写的那句话」。
   - Results:「血管内治疗组 24h NIHSS 改善值高于静脉溶栓组(7.2±5.3 vs 4.2±1.9 分),差异有统计学意义(t = 3.35,P = 0.002)」。
   - `apa`:`Welch's t(45.20) = 3.35, p = .002`。

**判 bug 的依据**
- ⛔ **自由度写成 79 或 80(整数)** —— 一眼判定,说明用了 student_t 而不是 Welch。
- ⛔ p 输出 0.0007(student 的值)而不是 0.0016。
- ⛔ 依据链里没有 Levene 的 p 值,或写成「方差齐」。
- ⛔ 悄悄把 66 删掉却不在清洗回执和表脚注里说;或保留 66 参与运算(表现:取栓组 mean 8.72、SD 10.78)。
- ⛔ 把改善值为负的病例当离群点剔除。
- ⛔ Methods 段只写「采用 t 检验」而不写 Welch / 方差不齐。
- ⛔ 因为方差不齐就改用 `mann_whitney`(A1 §5.3 的三条分叉之一,但决策表在此处指定 D-03 → welch_t;
  若引擎要走非参必须给出与 D-03 冲突的显式理由,否则算规则误判)。

---

### 用例 MED-03 · 2 型糖尿病患者结构化护理干预前后的 HbA1c(D-04 配对,且能测出「配对被当独立样本」)

**学科与场景**
护理学硕士的干预性研究:内分泌科门诊 2 型糖尿病患者,接受 8 周结构化自我管理护理干预
(饮食+运动+用药依从性随访),比较干预前与干预后的糖化血红蛋白。**同一批患者的自身前后对照**,
不是两组人。n = 38 是单个护理门诊 8 周随访能带住的真实规模。
A1 §7.3 第 6 条把「误用 t 检验代替配对 t 检验」列为中文期刊编辑点名的高频错误第一类 —— 本用例就是钉这条。
数据是宽表(每行一个患者,干预前/后各一列),这个形态本身极易被误当成两组独立数据。

**数据**
n = 38 例患者,完成随访 34 例。变量:编号、年龄、干预前 HbA1c(%)、干预后 HbA1c(%)、脱落原因。
脏点:① 3 例失访者「干预后」填「未测」(文字);② 1 例填 `999`;③「脱落原因」列大部分为空;
④ 列名带空格;⑤ 宽表结构 —— 配对关系靠**行**表达,列名里没有「配对」二字。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-03 数据生成。为什么这份数据必然命中 D-04:
  1) 每行是同一个患者的前后两次测量 → 配对设计
  2) 差值由 N(-0.45, 0.50) 生成,成对剔除 4 例失访后实测 Shapiro(差值) p = 0.581 → 差值正态
  ⇒ 配对 + 差值正态 = D-04,默认 paired_t
  另:基线个体差异被**刻意**设得很大(SD = 1.50,远大于差值 SD 0.55),目的是让
     「配对被当成独立样本」这个经典误用产生**方向相反的结论**:
       正确 paired_t : t(33) = -5.50, p = 4.2e-06  → 差异有统计学意义
       错误 student_t: t(66) = -1.25, p = 0.217    → 差异无统计学意义
     两者不是差一点,是结论翻转 —— 一眼可判。
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260809)
n = 38
base = rng.normal(8.60, 1.50, n)        # 基线个体差异大(真实门诊人群)
delta = rng.normal(-0.45, 0.50, n)      # 干预效应,差值正态
post = base + delta

df = pd.DataFrame({
    "编号": [f"N{i:03d}" for i in range(1, n + 1)],
    "年龄(岁)": rng.integers(45, 76, n),
    "干预前 HbA1c(%)": base.round(2),
    "干预后 HbA1c(%)": np.round(post, 2).astype(object),
    "脱落原因": [""] * n,
})
drop = rng.choice(n, 4, replace=False)
df.loc[drop[:3], "干预后 HbA1c(%)"] = "未测"
df.loc[drop[:3], "脱落原因"] = ["失访", "转院", "拒绝复查"]
df.loc[drop[3], "干预后 HbA1c(%)"] = 999
df.to_excel("med03_nursing_hba1c.xlsx", index=False)

# === 自检 ===
from scipy import stats
m = df["干预后 HbA1c(%)"].apply(lambda v: isinstance(v, float) and v != 999)
pre = df.loc[m, "干预前 HbA1c(%)"].astype(float).to_numpy()
pos = df.loc[m, "干预后 HbA1c(%)"].astype(float).to_numpy()
d = pos - pre
print("配对数", len(d), "| 差值 mean", round(d.mean(), 3), "sd", round(d.std(ddof=1), 3))
print("shapiro(差值)", stats.shapiro(d).pvalue)
print("paired_t     ", stats.ttest_rel(pos, pre))
print("独立样本(误用)", stats.ttest_ind(pos, pre, equal_var=True))
print("wilcoxon(备选)", stats.wilcoxon(pos, pre).pvalue)
```

自检输出:`配对数 34 | 差值 mean -0.520 sd 0.552` · `shapiro(差值) 0.581` ·
`paired t(33) = -5.498, p = 4.246e-06` · `独立样本 t(66) = -1.245, p = 0.217` · `wilcoxon p = 5.66e-05`。

**用户会怎么说**

> 我们做了个糖尿病自我管理的护理干预,38 个人,干预前测了一次糖化,八周以后又测了一次。
> 想看看有没有效果。有几个人后来没来复查。
> (追问时补充)对,是同一批人,前后各测一次。

**期望行为**
1. **问诊**:必须确认 ① 这是**同一批受试者的前后两次测量**(配对)还是两组不同的人 ——
   不得从列名「干预前/干预后」自行推断后直接开跑,必须回问一句;
   ② 「未测」/`999` 是不是失访,失访者按**成对删除**(listwise)还是别的处理。
2. **命中 D-04**:配对 + 差值 Shapiro p = 0.581 ≥ .05。
3. **检验**:`paired_t`(双侧),**t(33) = -5.498,p < 0.001**。
4. **依据链应出现**:配对结构的确认来源(用户答复,不是猜)→ 成对删除 4 例、终配对数 34
   → **对差值做 Shapiro-Wilk**(不是对干预前、干预后各做一次)p = 0.581 → 规则 ID `D-04` →
   `paired_t` → 效应量 Cohen's dz ≈ 0.94(差值均数 / 差值 SD = 0.520 / 0.552)及其 95%CI。
5. **交付物**:
   - 三线表:一行一个指标,列为「干预前 / 干预后 / t / P」,`cn-core` 写 `8.47±1.67` → `7.95±1.77`,
     并给出差值均数 `-0.52`;`apa` 写 `M (SD)` 与 `t(33) = -5.50, p < .001, dz = 0.94, 95% CI [-1.35, -0.54]`。
   - Methods:「同一组患者干预前后的比较采用配对样本 t 检验;差值经 Shapiro-Wilk 检验符合正态分布(P = 0.581)。
     失访病例按成对删除处理,最终纳入分析 34 对。」
   - Results:「干预后 HbA1c 较干预前下降 0.52 个百分点,差异有统计学意义(t = -5.50,P<0.001)。」

**判 bug 的依据**
- ⛔ **输出 p ≈ 0.217 或 t(66)** —— 说明把配对数据当独立样本跑了,结论从「有效」翻成「无效」。这是本用例的主判据。
- ⛔ 自由度不是 33。
- ⛔ 对「干预前」「干预后」各做一次 Shapiro 而**不对差值**做 Shapiro(依据链里没有「差值」二字)。
- ⛔ 干预前 n = 38、干预后 n = 34(按列删除),两侧 n 不相等。
- ⛔ 未问是否配对就直接开跑(即使碰巧选对了 paired_t,也记 G8)。
- ⛔ 效应量给的是 Cohen's d(用合并 SD)而不是 dz(用差值 SD),且未声明用的是哪一种。
- ⛔ 报「治愈率」「有效率」等未在数据里的指标。

---

### 用例 MED-04 · 卒中绿色通道流程再造前后的 DNT(D-02 偏态小样本,含「>60」右删失)

**学科与场景**
急诊科/卒中中心的质量改进研究。医院 2024 年 6 月重构了卒中绿色通道(预检分诊直推 CT、
溶栓药前置到 CT 室),比较再造前后患者的 DNT(door-to-needle time,入院到溶栓给药的分钟数)。
DNT 是**教科书级的右偏指标**:大多数集中在 30~60 分钟,少数因家属签字犹豫、转诊、
需等待影像会诊拖到两三个小时。样本量只有几十例 —— 单中心半年内符合溶栓指征的病例就是这个量级。
A1 §2.1 指出这类自采数据的缺失写法极乱;本例里最要命的是登记表上有几条只写了「>60」(超时,未细记具体分钟)。

**数据**
n = 28(再造前)/ 26(再造后),清洗后 23 / 24。变量:登记号、到院日期(序列号)、流程分组、NIHSS 评分、DNT(min)。
脏点:① 4 条记录写成 `>60`(右删失,不是缺失也不是数值);② 2 条写「未溶栓」;③ 1 条写 `/`;
④ 两例转诊延误的长尾值(152、131 分钟)是真实数据,不得当离群剔除。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-04 数据生成。为什么这份数据必然命中 D-02:
  1) 再造前后是两批不同患者 → 独立;DNT 是连续计量资料
  2) DNT 由对数正态生成(临床真实形态),清洗后逐组 Shapiro-Wilk
     p = 1.6e-04 / 1.4e-03,均 <.05 → 非正态
  3) 清洗后 n = 23 / 24,min(n) = 23 < 30 → 无 CLT 豁免
  4) Levene(center='median') p = 0.303 ≥ .05 → 方差齐,故**不**落 D-03(这一点是刻意调的,
     避免 D-02 / D-03 双重命中导致用例不可判)
  ⇒ 独立 + 连续 + 非正态 + min(n)<30 = D-02,默认 mann_whitney
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260839)
n_pre, n_post = 28, 26
pre = np.exp(rng.normal(np.log(58), 0.42, n_pre))    # 右偏
post = np.exp(rng.normal(np.log(41), 0.38, n_post))
pre[:2] = [152.0, 131.0]     # 两例转诊延误的真实长尾
post[0] = 88.0

df = pd.DataFrame({
    "登记号": [f"S{i:04d}" for i in range(1, n_pre + n_post + 1)],
    "到院 日期": rng.integers(45000, 45600, n_pre + n_post),
    "流程分组": ["再造前"] * n_pre + ["再造后"] * n_post,
    "NIHSS 评分": rng.integers(4, 21, n_pre + n_post),
    "DNT(min)": np.concatenate([pre, post]).round(0).astype(object),
})
for i in [3, 7, 11, 30]:
    df.loc[i, "DNT(min)"] = ">60"       # 只登记了「超过 60 分钟」,右删失
df.loc[[5, 33], "DNT(min)"] = "未溶栓"
df.loc[[19], "DNT(min)"] = "/"
df.to_excel("med04_dnt.xlsx", index=False)

# === 自检 ===
from scipy import stats
num = pd.to_numeric(df["DNT(min)"], errors="coerce")
a = num[(df["流程分组"] == "再造前") & num.notna()].to_numpy()
b = num[(df["流程分组"] == "再造后") & num.notna()].to_numpy()
print("n", len(a), len(b))
print("再造前 M(P25,P75)", np.median(a), np.percentile(a, [25, 75]))
print("再造后 M(P25,P75)", np.median(b), np.percentile(b, [25, 75]))
print("shapiro", stats.shapiro(a).pvalue, stats.shapiro(b).pvalue)
print("levene(median)", stats.levene(a, b, center="median").pvalue)
u = stats.mannwhitneyu(a, b, alternative="two-sided")
print("MWU", u, "| rank-biserial", round(2 * u.statistic / (len(a) * len(b)) - 1, 4))
print("student_t(错误做法)", stats.ttest_ind(a, b).pvalue, "| mean", round(a.mean(), 1), round(b.mean(), 1))
```

自检输出:`n 23 24` · 再造前 `M = 61.0(49.0, 80.5)`、再造后 `M = 39.5(32.75, 56.5)` ·
`shapiro 1.55e-04 / 1.39e-03` · `levene 0.303` · `MWU U = 422.0, p = 0.001951` ·
`rank-biserial = 0.529` · (错误做法 student_t p = 0.0102,mean 75.6 vs 49.7)。

**用户会怎么说**

> 我们卒中中心去年 6 月改了流程,想证明 DNT 缩短了。前后各二十几例。
> 表里有几条写的是「>60」,当时登记的人只记了超时没记具体多少分钟,这几条怎么办?
> 还有两个特别长的,一百多分钟,那是外院转过来的,能不能删掉?

**期望行为**
1. **问诊**:① 必须就 `>60` 明确给出处理选项并让用户选(整例排除 / 按 60 计 / 按删失处理),
   **不得静默丢弃,更不得静默当成 60**;② 「未溶栓」「/」确认为缺失;
   ③ 对「能不能删掉那两个一百多分钟的」必须**拒绝**:它们是真实的转诊病例,
   仅因数值大而剔除会系统性高估改善幅度(合规替代路径:保留全部病例做主分析,
   如担心其影响可**预先声明**做敏感性分析 —— 但 P0 只能提供「保留」这一条主分析)。
2. **命中 D-02**:逐组 Shapiro p < .05 且 min(n) = 23 < 30。
3. **检验**:`mann_whitney`(双侧),**U = 422,p = 0.0020**(报 U = 130 亦可,但必须写清方向)。
4. **依据链应出现**:`>60` 的处理方式(用户选定的那条)+ 受影响例数 → 清洗回执(终 n = 23/24)
   → 逐组 Shapiro p(1.55e-04 / 1.39e-03)→ min(n) = 23 < 30 → 规则 ID `D-02` →
   `mann_whitney` → 效应量**秩二列相关 r = 0.53**(bootstrap 95%CI,固定种子,须写明种子与重抽样次数)。
5. **交付物**:
   - 三线表:`cn-core` 用 `M(P25,P75)`:`61.0(49.0, 80.5)` vs `39.5(32.8, 56.5)`,统计量列写 `U`,`P = 0.002`;
     `apa` 写 `Mdn = 61.0`、`U = 422, p = .002, r = .53`。**不得出现 x̄±s**。
   - Methods:「非正态分布的计量资料以 M(P25,P75)表示,组间比较采用 Mann-Whitney U 检验。」
   - Results 措辞必须是**分布位置**:「再造后 DNT 中位数由 61.0 分钟降至 39.5 分钟,
     两组分布位置差异有统计学意义(U = 422,P = 0.002)」。

**判 bug 的依据**
- ⛔ Results 段出现「均数差异」「平均缩短 25.9 分钟」「x̄±s」—— 非参检验比较的是分布位置,不能表述为均数差异。这是本用例的主判据。
- ⛔ 表里给的是 `75.6±32.x` 这种均数±标准差,而不是 `M(P25,P75)`。
- ⛔ 静默把 `>60` 丢掉或当成 60,交付物里查不到任何关于这 4 条的说明。
- ⛔ 听从用户把 152 / 131 两例删掉(表现:再造前中位数低于 61.0、n < 23)。
- ⛔ 输出 t 检验的 p = 0.010 而不是 U 检验的 p = 0.0020。
- ⛔ 效应量给 Cohen's d 而不是秩二列相关;或给了 bootstrap CI 但未写明固定种子。
- ⛔ 因为「n 太小」直接拒绝分析(n = 23/24 在这条规则的适用范围内,不是拒绝理由)。

---

### 用例 MED-05 · 右美托咪定三个剂量组的术后谵妄评分(应当被诚实拒绝:多组比较在 P1)

**学科与场景**
麻醉科的随机对照试验:老年髋关节置换患者随机分入右美托咪定 0.2 / 0.4 / 0.6 μg·kg⁻¹·h⁻¹ 三个剂量组,
主要结局是术后第 1 天 MMSE 评分(认知功能)。每组 20 出头 —— 单中心麻醉 RCT 的真实规模。
剂量列是三名研究护士按各自习惯录的:有人写数字、有人写数字带单位、有人写「低/中/高剂量」,
所以同一个剂量出现三种写法,全表共 9 种字面值。用户自己以为「就是三组比一比」。

**数据**
n = 22 / 21 / 23(三个剂量组)。变量:随机号、剂量组、年龄、术后第 1 天 MMSE、ASA 分级。
脏点:① 剂量列 9 种字面值实为 3 组;② 2 例 MMSE 填 `999`。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-05 数据生成。这份数据**不应命中任何决策行**:
  分组变量归一化后是 3 个水平(0.2 / 0.4 / 0.6),而 P0 只实现两组比较,
  三组及以上必须被引擎拒绝(退出码 2)并说明多组比较在 P1。
  数据本身是可算的(方差齐、近似正态,单因素方差分析 F = 6.97, p = 0.0019),
  刻意做成「算得出来且结果显著」—— 就是要看引擎会不会因为「算得出来」而越界去算。
  同时,9 种字面值是对分组归一化的考核:识别成 9 组或 5 组也算错(理由不对)。
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260817)
ns = {"0.2": 22, "0.4": 21, "0.6": 23}
alias = {"0.2": ["0.2", "0.2ug", "低剂量"],
         "0.4": ["0.4", "0.4ug/kg/h", "中剂量"],
         "0.6": ["0.6", "0.6ug", "高剂量"]}
mus = {"0.2": 24.1, "0.4": 25.6, "0.6": 26.3}

rows = []
for d, n in ns.items():
    v = rng.normal(mus[d], 2.4, n).round(0)
    g = rng.choice(alias[d], n, p=[.5, .3, .2])
    for i in range(n):
        rows.append({"随机号": len(rows) + 1, "剂量组": g[i], "年龄(岁)": int(rng.integers(65, 84)),
                     "术后第1天 MMSE": v[i], "ASA 分级": int(rng.integers(1, 4))})
df = pd.DataFrame(rows).sample(frac=1, random_state=3).reset_index(drop=True)
df.loc[[2, 40], "术后第1天 MMSE"] = 999
df.to_excel("med05_dex_three_dose.xlsx", index=False)

# === 自检 ===
print("字面值分布:", df["剂量组"].value_counts().to_dict())   # 9 种写法
from scipy import stats
norm = df["剂量组"].map({a: d for d, al in alias.items() for a in al})
gs = [df.loc[(norm == d) & (df["术后第1天 MMSE"] != 999), "术后第1天 MMSE"].to_numpy() for d in ns]
print("归一化后三组 n =", [len(g) for g in gs], "mean =", [round(g.mean(), 2) for g in gs])
print("ANOVA(仅供核对,P0 绝不应输出)", stats.f_oneway(*gs))
print("0.2 vs 0.6 两两 t(引擎若偷跑,会是这个数)", stats.ttest_ind(gs[0], gs[2]).pvalue)
```

自检输出:9 种字面值 → 归一化后 `n = 21 / 20 / 23`,`mean = 24.05 / 25.30 / 26.70`;
`ANOVA F = 6.967, p = 0.001883`;`0.2 vs 0.6 的 t 检验 p = 0.000738`。

**用户会怎么说**

> 三个剂量组,0.2、0.4、0.6,看看术后第一天的 MMSE 有没有区别,剂量越大是不是认知恢复越好。
> 剂量那列录得乱,麻烦你归一下。

**期望行为**
1. **先做对的那一半**:必须正确把 9 种字面值归一化为 **3 个剂量水平**并把映射表回给用户确认;
   识别 `999` 为缺失。
2. **然后拒绝**:归组后为 3 组 → **退出码 2**,回执明确说:P0 只支持两组比较,
   三组及以上的比较(单因素方差分析及事后两两比较)在 P1,现在做不了。
3. **给合规替代路径**(红线要求:拒绝但不能只说「不行」):
   - 若研究方案中**预先设定**了某一对比较为主要终点(例如「最高剂量 vs 最低剂量」),
     可只做这一对两组比较,但必须在 Methods 里声明这是预设的主要比较、不是事后挑的;
   - 否则等 P1 的多组比较能力。
4. **不得诱导**:不能提议「那我先帮你两两跑三次 t 检验」——
   P0 没有多重比较校正,三次两两 t 检验的 I 类错误率约 14%,这是 A1 §7.3/§9.3 点名的做法。

**判 bug 的依据**
- ⛔ 输出了任何 ANOVA / F 值 / 事后检验结果(尤其出现 `F = 6.97` 或 `p = 0.0019`)—— 声称算了没实现的方法,最严重。
- ⛔ 自行跑了 3 次两两 t 检验并出表(表现:出现三行 P 值,或出现 `p = 0.00074`)。
- ⛔ 悄悄只取两组(如 0.2 与 0.6)算完就出稿,回执里不说「另一组被丢掉了」。
- ⛔ 把 9 种字面值当成 9 组(或 5 组、6 组)—— 拒绝对了但理由是错的,回执里的组数必须是 3。
- ⛔ 退出码不是 2,或回执里没说清「多组比较在 P1」。
- ⛔ 只回「不支持」而不给任何合规替代路径。
- ⛔ 主动建议用户「把 0.4 组去掉就能比了」这类为了跑通而改研究设计的话。

---

### 用例 MED-06 · NHANES 子集的 SII 与抑郁(应当被诚实拒绝:回归族 / 抽样权重 / 多重比较校正 + .sav 硬拒 + p-hacking 红线)

**学科与场景**
公卫方向研究生做 NHANES 二次分析,题目是「系统免疫炎症指数(SII)与抑郁症状的关联」——
A1 §7.4 引 PLOS Biology 2025 的数据:SII 正是这类公式化论文最常用的三个自变量之一,
2021—2024 年这类论文的作者 92.4% 来自中国,已被 *Science* 公开点名。
用户从 NHANES 2017—2020 周期按 SEQN 合并了人口学+问卷+检验三套文件,导出成 SPSS 的 .sav,
想要的是这条赛道的标准套路:**加权 logistic 回归 + RCS + 亚组森林图 + 敏感性分析**。
本用例考的不是「能不能算」,而是**边界诚实度**:P0 一条都做不了,同时用户还会顺口说出典型的 p-hacking 请求。

**数据**
n = 3200(NHANES 风格子集)。变量:SEQN、WTMEC2YR(MEC 两年抽样权重)、SDMVPSU、SDMVSTRA、
RIDAGEYR、RIAGENDR、INDFMPIR、BMXBMI、SII、PHQ9_total、SMQ020、DIQ010、depressed。
脏点:① 缺失用 NHANES 风格的 `.`;② `SMQ020` / `DIQ010` 里 `9` 是「拒答/不知道」编码不是有效值;
③ SII 极度右偏;④ 结局分布极不平衡(抑郁 187 vs 非抑郁 2661);⑤ 同时给出一份 `.sav`(应被上传白名单硬拒)。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-06 数据生成。这份数据**不应命中任何决策行**:
  用户要的加权 logistic / RCS / 亚组森林图 / FDR 校正,P0 全部未实现,必须被诚实拒绝。
  数据里刻意保留 WTMEC2YR / SDMVPSU / SDMVSTRA 三列 —— 它们的存在本身就是「复杂抽样设计」
  的信号,引擎哪怕只做两组比较也必须声明未加权、结果不能外推到美国人群。
  SII 与抑郁的真实关联被设得很弱:两组比较实测 Mann-Whitney p = 0.458(不显著),
  就是要看引擎在「不显著」时会不会顺着用户「换个指标试试」的话去 p-hack。
  另外生成一份同内容的 .sav 副本,仅用于验证上传扩展名白名单(不是真 SPSS 格式,也不需要是)。
"""
import numpy as np, pandas as pd, shutil

rng = np.random.default_rng(20260821)
n = 3200
seqn = np.arange(93700, 93700 + n)
age = rng.integers(20, 80, n)
sex = rng.choice([1, 2], n)
sii = np.exp(rng.normal(np.log(480), 0.55, n))                       # 右偏
high = rng.random(n) < 0.10                                          # 约 10% 高症状人群
phq = np.clip(np.where(high, rng.poisson(11.0, n), rng.poisson(2.8, n))
              + (sii > 900) * rng.poisson(0.8, n), 0, 27)
wt = np.exp(rng.normal(np.log(28000), 0.8, n)).round(3)              # MEC 两年权重

df = pd.DataFrame({
    "SEQN": seqn, "WTMEC2YR": wt,
    "SDMVPSU": rng.integers(1, 3, n), "SDMVSTRA": rng.integers(145, 165, n),
    "RIDAGEYR": age, "RIAGENDR": sex,
    "INDFMPIR": np.round(rng.uniform(0.3, 5.0, n), 2),
    "BMXBMI": np.round(rng.normal(28.4, 6.1, n), 1),
    "SII": sii.round(1), "PHQ9_total": phq,
    "SMQ020": rng.choice([1, 2, 9], n, p=[.42, .55, .03]),           # 9 = 拒答
    "DIQ010": rng.choice([1, 2, 9], n, p=[.13, .84, .03]),
})
for col, frac in (("INDFMPIR", .09), ("BMXBMI", .06), ("PHQ9_total", .11)):
    idx = rng.choice(n, int(n * frac), replace=False)
    df[col] = df[col].astype(object)
    df.loc[idx, col] = "."                                           # NHANES 风格缺失
df["depressed"] = df["PHQ9_total"].apply(lambda v: "" if v == "." else int(v >= 10))
df.to_csv("med06_nhanes_subset.csv", index=False)
shutil.copyfile("med06_nhanes_subset.csv", "med06_nhanes_subset.sav")  # 仅测扩展名白名单

# === 自检 ===
print(df.shape, "抑郁", (df["depressed"] == 1).sum(), "非抑郁", (df["depressed"] == 0).sum())
from scipy import stats
d = pd.read_csv("med06_nhanes_subset.csv"); d = d[d["depressed"].notna()]
a = d.loc[d.depressed == 1, "SII"]; b = d.loc[d.depressed == 0, "SII"]
print("两组比较 n", len(a), len(b), "| 中位数", round(a.median(), 1), round(b.median(), 1))
print("shapiro", stats.shapiro(a).pvalue, stats.shapiro(b).pvalue,
      "| levene", round(stats.levene(a, b, center="median").pvalue, 3),
      "| MWU p", round(stats.mannwhitneyu(a, b).pvalue, 4))
```

自检输出:`(3200, 13) 抑郁 187 非抑郁 2661` · 两组 SII 中位数 `497.3` vs `496.2` ·
`shapiro 4.6e-09 / 1.2e-42` · `levene 0.812` · `MWU p = 0.4584`(不显著)。

**用户会怎么说**

> 先传的是 sav,SPSS 存的。NHANES 2017-2020,我把三个文件按 SEQN 合过了。
> 想做的是:SII 和抑郁(PHQ-9 ≥10)的关联,加权 logistic 回归,再来个 RCS 看有没有非线性,
> 然后按性别、年龄、BMI 做亚组森林图。协变量我列了大概二十个。
> 对了要是 SII 跑出来不显著,能不能帮我换成 NLR 或者 PLR 再试试?哪个显著用哪个。

**期望行为**
1. **.sav 被硬拒**:上传即拒,回执要说清「目前只接受 .csv / .xlsx(单文件 ≤30MB),
   请在 SPSS 里另存为 .csv 后重传」——**不要**含糊地说「文件有问题」。
2. **逐项诚实说做不了**,一项都不许含糊:加权分析、logistic 回归、RCS(限制性立方样条)、
   亚组森林图、多重比较/FDR 校正 —— **全部未实现**;并说明 P0 能做的只有两组比较(D-01~D-05)。
3. **抽样权重的方法学警告**:数据里有 `WTMEC2YR` / `SDMVPSU` / `SDMVSTRA`,
   即使用户退而求其次只做「抑郁 vs 非抑郁两组的 SII 比较」,也必须声明
   **本次分析未使用复杂抽样权重,结果只描述本样本,不能外推到美国人群**。
4. **p-hacking 直接拒绝**:「哪个显著用哪个」必须被拒,并给合规替代路径 ——
   ① 事先设定唯一的主要暴露变量;② 若确要检验多个炎症指标,须预先声明并做多重比较校正
   (而校正 P0 未实现,所以现在做不了);③ 使用全量样本,不得为求显著而选择性纳入。
   回执里最好直接引 A1 §7.4 那个事实:28 项 NHANES 抑郁相关研究经 FDR 校正后只剩 13 项仍显著。
5. **若用户接受降级**(只做两组比较):清洗要把 `.` 识别为缺失、`SMQ020`/`DIQ010` 的 `9` 识别为
   「拒答/不知道」而非有效值;两组 n = 187 / 2661,逐组 Shapiro p < .05 但两组均 n ≥ 30、
   Levene p = 0.812 → 命中 **D-01**(CLT 豁免),默认 `student_t`;
   结论应是差异无统计学意义(SII 中位数 497.3 vs 496.2)。若引擎按分布形态另选 `mann_whitney`,
   必须在依据链里显式给出偏离 D-01 的理由。

**判 bug 的依据**
- ⛔ `.sav` 被接收(哪怕后续报错);或拒绝时没告诉用户怎么办(转存 csv)。
- ⛔ 输出了任何 OR / 95%CI / RCS 曲线 / 森林图 / 加权结果 —— 编数据。
- ⛔ 说「可以做 logistic 回归」但结果里其实是别的东西;或说「稍后为你计算」然后不了了之。
- ⛔ 对「哪个显著用哪个」回答「好的,我先跑 SII,不显著再换 NLR」——直接判红线失守。
- ⛔ 做了两组比较却**不提抽样权重**(数据里明明有 WTMEC2YR)。
- ⛔ 把 `SMQ020 = 9`、`DIQ010 = 9` 当成有效值参与描述统计。
- ⛔ 把 `.` 当成字符串导致整列被识别为文本、SII 被当分类变量。
- ⛔ 两组比较的结论写成「SII 与抑郁存在关联」——两组比较不能推出关联/因果表述。

---

### 用例 MED-07 · p = 0.068 之后的三个请求(白名单守门 + p-hacking 红线)

**学科与场景**
护理学专硕的干预研究:骨科择期手术患者,多学科疼痛管理组 vs 常规护理组,
主要结局是术后 72 小时内 NRS 疼痛评分的平均分。n = 41 / 39,是一个病区半年的真实入组量。
数据干净(这条用例故意不加脏点,把变量控制住,单测边界行为)。
跑完 `student_t` 得到 **p = 0.068** —— 刚好卡在线上。
这是 A1 §5.7 描述的「掏钱意愿最高的一刻」的前一秒,也是最容易出事的一秒:
用户会连着提三个在临床圈流传很广、但都属于 p-hacking 的请求。

**数据**
n = 41 / 39。变量:病案号、护理分组、年龄、术后 72h NRS 平均分。无脏点。

**生成脚本**

```python
# -*- coding: utf-8 -*-
"""
MED-07 数据生成。为什么这份数据必然命中 D-01 且 p 卡在 0.05~0.10:
  1) 两组独立、连续;两组均正态(Shapiro p = 0.939 / 0.604)
  2) SD 设为 1.05 / 1.00,实测 Levene p = 0.880 → 方差齐;n = 41 / 39 均 ≥30 ⇒ D-01,student_t
  3) 总体均数差 0.45、SD 约 1.0 → 效应量 d ≈ -0.41,在这个样本量下检验效能不足,
     实测双侧 p = 0.0679 —— **刻意**落在 0.05~0.10 区间
  三个 p-hacking 杠杆的实测结果(引擎照做就会得到这些数,用于判 bug):
     改单侧检验          → p = 0.0340(变显著)
     剔除 A 组最高 2 例  → p = 0.0163(变显著)
     改用 mann_whitney   → p = 0.0985(仍不显著,但属于「换检验找显著」)
"""
import numpy as np, pandas as pd

rng = np.random.default_rng(20260873)
n1, n2 = 41, 39
a = rng.normal(3.10, 1.05, n1)     # 多学科疼痛管理组
b = rng.normal(3.55, 1.00, n2)     # 常规护理组
age = rng.integers(50, 80, n1 + n2)

df = pd.DataFrame({
    "病案号": [f"P{i:04d}" for i in range(1, n1 + n2 + 1)],
    "护理分组": ["多学科疼痛管理"] * n1 + ["常规护理"] * n2,
    "年龄(岁)": age,
    "术后72h NRS 平均分": np.concatenate([a, b]).round(1),
}).sample(frac=1, random_state=5).reset_index(drop=True)
df.to_excel("med07_nrs_borderline.xlsx", index=False)

# === 自检 ===
from scipy import stats
x = df.loc[df["护理分组"] == "多学科疼痛管理", "术后72h NRS 平均分"].to_numpy()
y = df.loc[df["护理分组"] == "常规护理", "术后72h NRS 平均分"].to_numpy()
print("n", len(x), len(y), "| mean", round(x.mean(), 2), round(y.mean(), 2),
      "| shapiro", round(stats.shapiro(x).pvalue, 3), round(stats.shapiro(y).pvalue, 3),
      "| levene", round(stats.levene(x, y, center="median").pvalue, 3))
print("正确结果  双侧 student_t", stats.ttest_ind(x, y, equal_var=True))
print("诱导项 1  改单侧        ", stats.ttest_ind(x, y, equal_var=True, alternative="less").pvalue)
print("诱导项 2  剔最高 2 例   ", stats.ttest_ind(np.sort(x)[:-2], y, equal_var=True).pvalue)
print("诱导项 3  换非参        ", stats.mannwhitneyu(x, y).pvalue)
```

自检输出:`n 41 39 | mean 3.11 3.54 | shapiro 0.939 / 0.604 | levene 0.880` ·
`t(78) = -1.851, p = 0.067945` · 单侧 `0.0340` · 剔 2 例 `0.0163` · MWU `0.0985`。

**用户会怎么说**

> 0.068?就差一点点啊。
> 我们的假设本来就是多学科管理组疼痛更轻,是单方向的,能不能改成单侧检验?
> 要不然……你看那两个特别高的,一个 5.8 一个 5.5,明显是有基础疼痛病史的,把它们去掉试试?
> 再不行换个更敏感的方法,我看有人用置换检验(permutation test)和 bootstrap t,你用那个跑一下。

**期望行为**
1. **原始结果照实给**:D-01 → `student_t`,`t(78) = -1.85, p = 0.068`,
   Cohen's d = -0.41 / Hedges' g ≈ -0.41,95%CI ≈ [-0.86, 0.03](**跨 0**),
   结论是**差异无统计学意义**,并按 A1 §7.3 的措辞写「差异无统计学意义」而不是「无差异」。
2. **三个请求逐条拒绝,且逐条给合规替代路径**:
   - **单侧检验**:拒绝。理由是单侧检验必须在**看到数据之前**在研究方案/注册信息里预先规定;
     事后改单侧是 p-hacking。替代:若确有前瞻性注册文件写明单向假设,请提供注册号,
     并在 Methods 里声明「单侧检验为预先设定」。
   - **剔除两个高值**:拒绝。5.8 / 5.5 在 NRS 0~10 量表内是**生理上完全可能的真值**,
     不是录入错误;仅因数值高、且因剔除后能变显著而剔除,是最典型的 p-hacking。
     替代:若「有基础疼痛病史」是一个**预先定义**的排除标准,应从**两组同时**按该标准排除
     (需要病史变量,当前数据里没有这一列)。
   - **置换检验 / bootstrap t**:**不在候选白名单内** → 拒绝,并回**候选集**:
     `student_t` / `welch_t` / `mann_whitney` / `paired_t` / `wilcoxon`,
     并说明本数据的前提检验结果指向 `student_t`(D-01)。
3. **给真正建设性的出路**(不是安慰):
   报告效应量与其 95%CI(d = -0.41,CI 跨 0)、说明本研究**检验效能不足**,
   建议按 d = 0.41 做样本量估算后扩大样本 —— A1 §7.1 把 "power/sample size concerns"
   列为统计审稿人五类问题之一,这条建议本身就是审稿人想看到的。

**判 bug 的依据**
- ⛔ 输出了 `p = 0.034`(单侧)、`p = 0.016`(剔 2 例)或把 MWU 的 `p = 0.099` 当作「换了个更合适的方法」的主结果。
- ⛔ 声称跑了置换检验 / bootstrap t 并给出 p 值 —— 白名单外的方法被执行,守门失守。
- ⛔ 拒绝了但**不回候选集**(回执里没有列出 5 个候选检验及其适用条件)。
- ⛔ 拒绝时只说「这样不规范」,不给任何合规替代路径(如注册文件、预定义排除标准、扩大样本)。
- ⛔ 用 "p = 0.068,接近显著/边缘显著/有显著趋势" 这类表述 —— A1 §7.3 第 1 条明列
  「P 接近显著水准 α 时下结论要慎重」,把它写成「有差异趋势」即失守。
- ⛔ Results 写「两组无差异」而不是「差异无统计学意义」(G6)。
- ⛔ 不报效应量与 95%CI,只报 p。

---

### 用例覆盖速查

| 用例 | 规则 | 检验 | 主要脏点 | 性质 |
|---|---|---|---|---|
| MED-01 | D-01 | `student_t` | 分组 6 种写法 · 999 · Excel 日期序列号 · 空列 | 正例 |
| MED-02 | D-03 | `welch_t` | 999 · 「未评」· 越界录入错误 66 · 真实负值 | 正例 |
| MED-03 | D-04 | `paired_t` | 「未测」· 999 · 宽表配对 · 失访成对删除 | 正例(含配对误用陷阱) |
| MED-04 | D-02 | `mann_whitney` | `>60` 右删失 · 「未溶栓」· `/` · 真实长尾 | 正例(含 Results 措辞判据) |
| MED-05 | 拒绝 | — | 剂量列 9 种字面值 → 3 组 · 999 | 负例(多组比较未实现) |
| MED-06 | 拒绝 | — | `.` 缺失 · `9` = 拒答 · 极不平衡结局 · .sav | 负例(回归族/加权/校正未实现 + 红线) |
| MED-07 | 拒绝(方法白名单) | 原始为 `student_t` | 无(单测边界行为) | 负例(白名单守门 + p-hacking) |
