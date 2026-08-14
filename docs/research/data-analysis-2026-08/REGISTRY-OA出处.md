# 决策规则 OA 出处改写(D-01~D-22)

> **为什么改**:此前 22 条决策规则的 primary 大量是纸质教科书(Altman / Field / Zar / Agresti)与付费老论文
> (Duncan 1955 / Dunn 1964 / Games & Howell 1976 / Cochran 1954),甚至有**从未正式出版的手稿**(Tukey 1953)。
> 方法学评审交给 agent 之后,agent 拿不到原文就只能输出 `unverifiable` —— 机制会在 2/3 的规则上空转。
> 用户 2026-08-05 拍板:**系统性把 primary 换成开放获取文献,教科书降 secondary**。
>
> **本文档已过独立回核**:找源与回核由不同 agent 完成,回核员逐条打开 URL、在全文里搜摘录、判断是否真的支持规则。
> 共 86 条候选出处,**通过 72 条,存疑 14 条**。
> 存疑条目**一律不进第〇章总览表**,全部移入 §六。
>
> 用途:本文件是 `registry/sources/citations.yaml` 的**内容真源**,写方法卡时逐条照抄。

---

## 〇 · 总览表

> ⚠️ **「回核」列是规则级聚合,不是本行那一条的结论**:该规则名下**任一**候选出处未通过即标 ⚠️。
> 因此 ⚠️ 不等于「本行这条不可用」—— 多数情况下是同规则的**另一条**候选被判不通过(方向相反 / 拼接 / 引到了参考文献表)。
> 要判断某一条具体出处能不能用,看 §六 的逐条明细。这个口径刻意从宽:宁可多标一个 ⚠️ 让人去查,不可漏标一个假绿。

| 规则 | primary(OA) | access | 回核 | secondary(教科书) |
|---|---|---|---|---|
| **D-01** | [Kim HY. Statistical notes for clinical researchers: the independent samples t-test. Restorative Dentistry & Endodontics. 2019;44(3):e26. doi:10.5395/r](https://www.rde.ac/upload/pdf/rde-44-e26.pdf) | `oa` | ⚠️ 部分存疑 | Altman DG. Practical Statistics for Medical Research. 1st ed. London: Chapman & Hall; 1991 |
| **D-02** | [Kim HY. Statistical notes for clinical researchers: the independent samples t-test. Restorative Dentistry & Endodontics. 2019;44(3):e26. doi:10.5395/r](https://www.rde.ac/upload/pdf/rde-44-e26.pdf) | `oa` | ⚠️ 部分存疑 | Field A. Discovering Statistics Using IBM SPSS Statistics. 5th ed. London: Sage; 2018. Ch. |
| **D-03** | [Delacre M, Lakens D, Leys C. Why psychologists should by default use Welch's t-test instead of Student's t-test. International Review of Social Psycho](https://rips-irsp.com/articles/10.5334/irsp.82/) | `oa` | ⚠️ 部分存疑 | Zar JH. Biostatistical Analysis. 5th ed. Upper Saddle River: Pearson Prentice Hall; 2010.  |
| **D-04** | [Whitley E, Ball J. Statistics review 5: Comparison of means. Critical Care. 2002;6(5):424–428. doi:10.1186/cc1548](https://europepmc.org/articles/PMC137324) | `oa` | ✅ 通过 | Altman DG. Practical Statistics for Medical Research. 1st ed. London: Chapman & Hall; 1991 |
| **D-05** | [Whitley E, Ball J. Statistics review 6: Nonparametric methods. Critical Care. 2002;6(6):509–513. doi:10.1186/cc1820](https://europepmc.org/articles/PMC153434) | `oa` | ✅ 通过 | Field A. Discovering Statistics Using IBM SPSS Statistics. 5th ed. London: Sage; 2018. Ch. |
| **D-06** | [Bewick V, Cheek L, Ball J. Statistics review 9: One-way analysis of variance. Critical Care. 2004;8(2):130–136. doi:10.1186/cc2836](https://pmc.ncbi.nlm.nih.gov/articles/PMC420045/) | `oa` | ✅ 通过 | Zar JH. Biostatistical Analysis. 5th ed. Pearson. Ch. 10 "Multisample Hypotheses and the A |
| **D-07** | [Delacre M, Leys C, Mora YL, Lakens D. Taking Parametric Assumptions Seriously: Arguments for the Use of Welch's F-test instead of the Classical F-test](https://rips-irsp.com/articles/198/files/submission/proof/198-1-2046-1-10-20190801.pdf) | `oa` | ⚠️ 部分存疑 | Zar JH. Biostatistical Analysis. 5th ed. Ch. 10 "Multisample Hypotheses and the Analysis o |
| **D-08** | [Bewick V, Cheek L, Ball J. Statistics review 10: Further nonparametric methods. Critical Care. 2004;8(3):196–199. doi:10.1186/cc2857](https://pmc.ncbi.nlm.nih.gov/articles/PMC468904/) | `oa` | ⚠️ 部分存疑 | Zar JH. Biostatistical Analysis. 5th ed. Ch. 10，非参数方差分析（Kruskal–Wallis）一节。⚠️ 现卡片写的 "Zar ch |
| **D-09** | [Agbangba, C. E., Sacla Aide, E., Honfo, H., & Glèlè Kakaï, R. (2024). On the use of post-hoc tests in environmental and biological sciences: A critica](https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/) | `oa` | ✅ 通过 | Gomez, K. A., & Gomez, A. A. (1984). Statistical Procedures for Agricultural Research (2nd |
| **D-10** | [Midway, S., Robertson, M., Flinn, S., & Kaller, M. (2020). Comparing multiple comparisons: practical guidance for choosing the best multiple compariso](https://pmc.ncbi.nlm.nih.gov/articles/PMC7720730/) | `oa` | ⚠️ 部分存疑 | Montgomery, D. C. (2019). Design and Analysis of Experiments (10th ed.). Wiley. Ch. 3 §3.5 |
| **D-11** | [Lee, S., & Lee, D. K. (2018). What is the proper way to apply the multiple comparison test? Korean Journal of Anesthesiology, 71(5), 353–360. https://](https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/) | `oa` | ⚠️ 部分存疑 | Howell, D. C. (2013). Statistical Methods for Psychology (8th ed.). Wadsworth Cengage. Ch. |
| **D-12** | [Lee, S., & Lee, D. K. (2018). What is the proper way to apply the multiple comparison test? Korean Journal of Anesthesiology, 71(5), 353–360. https://](https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/) | `oa` | ⚠️ 部分存疑 | Zar, J. H. (2010). Biostatistical Analysis (5th ed.). Pearson. Ch. 11 |
| **D-13** | [Campbell I. Chi-squared and Fisher–Irwin tests of two-by-two tables with small sample recommendations. Statistics in Medicine. 2007;26(19):3661–3675. ](https://www.iancampbell.co.uk/twobytwo/files/campbell_twobytwo_preprint.pdf) | `oa` | ✅ 通过 | Armitage P, Berry G, Matthews JNS. Statistical Methods in Medical Research. 4th ed. Oxford |
| **D-14** | [Bewick V, Cheek L, Ball J. Statistics review 8: Qualitative data – tests of association. Critical Care. 2004;8(1):46–53. doi:10.1186/cc2428](https://pmc.ncbi.nlm.nih.gov/articles/PMC420070/) | `oa` | ⚠️ 部分存疑 | Agresti A. Categorical Data Analysis. 3rd ed. Hoboken: Wiley; 2013. Chapter 3 “Inference f |
| **D-15** | [Bewick V, Cheek L, Ball J. Statistics review 8: Qualitative data – tests of association. Critical Care. 2004;8(1):46–53. doi:10.1186/cc2428](https://pmc.ncbi.nlm.nih.gov/articles/PMC420070/) | `oa` | ⚠️ 部分存疑 | Agresti A. Categorical Data Analysis. 3rd ed. Hoboken: Wiley; 2013. Chapter 3 “Inference f |
| **D-16** | [Bewick V, Cheek L, Ball J. Statistics review 14: Logistic regression. Critical Care. 2005;9(1):112–118. doi:10.1186/cc3045](https://pmc.ncbi.nlm.nih.gov/articles/PMC1065119/) | `oa` | ✅ 通过 | Hosmer DW Jr, Lemeshow S, Sturdivant RX. Applied Logistic Regression. 3rd ed. Wiley; 2013. |
| **D-17** | [van Smeden M, de Groot JAH, Moons KGM, Collins GS, Altman DG, Eijkemans MJC, Reitsma JB. No rationale for 1 variable per 10 events criterion for binar](https://pmc.ncbi.nlm.nih.gov/articles/PMC5122171/) | `oa` | ✅ 通过 | Peduzzi P, Concato J, Kemper E, Holford TR, Feinstein AR. A simulation study of the number |
| **D-18** | [Ernst AF, Albers CJ. Regression assumptions in clinical psychology research practice—a systematic review of common misconceptions. PeerJ. 2017;5:e3323](https://pmc.ncbi.nlm.nih.gov/articles/PMC5436580/) | `oa` | ✅ 通过 | Zar JH. Biostatistical Analysis. 5th ed. Ch. 17 "Simple Linear Regression"（章号已用出版社官方目录核对）； |
| **D-19** | [Clark TG, Bradburn MJ, Love SB, Altman DG. Survival Analysis Part I: Basic concepts and first analyses. British Journal of Cancer. 2003;89(2):232–238.](https://pmc.ncbi.nlm.nih.gov/articles/PMC2394262/) | `oa` | ✅ 通过 | Collett D. Modelling Survival Data in Medical Research. 3rd ed. Chapman & Hall/CRC; 2015.  |
| **D-20** | [Bradburn MJ, Clark TG, Love SB, Altman DG. Survival Analysis Part II: Multivariate data analysis – an introduction to concepts and methods. British Jo](https://pmc.ncbi.nlm.nih.gov/articles/PMC2394368/) | `oa` | ✅ 通过 | Collett D. Modelling Survival Data in Medical Research. 3rd ed. Chapman & Hall/CRC; 2015.  |
| **D-21** | [Tavakol M, Dennick R. Making sense of Cronbach's alpha. International Journal of Medical Education. 2011;2:53–55. doi:10.5116/ijme.4dfb.8dfd](https://pmc.ncbi.nlm.nih.gov/articles/PMC4205511/) | `oa` | ⚠️ 部分存疑 | Nunnally JC, Bernstein IH. Psychometric Theory. 3rd ed. McGraw-Hill; 1994. Chapter 7 “The  |
| **D-22** | [Watkins MW. Exploratory Factor Analysis: A Guide to Best Practice. Journal of Black Psychology. 2018;44(3):219–246. doi:10.1177/0095798418771807](https://edpsychassociates.com/Papers/EFAguide(2018).pdf) | `free_to_read` | ✅ 通过 | Fabrigar LR, Wegener DT. Exploratory Factor Analysis. OUP; 2012. Chapters 3–5(纸质,降为 second |

---

## 一 · D-01 ~ D-05 两组比较族

## D-01 ~ D-05 两组比较族：primary 出处开放获取化（2026-08-05 核对）

**核对方式**：全部 primary 均已 WebFetch 打开全文并逐字取证；PDF 类出处直接按页读取版式，摘录带页码/节号。
教科书（Altman / Field / Zar）全部保留但降为 `secondary`。

**本批总览**

| 规则 | 新 primary（OA） | 原纸质出处 → 降级 | 备注 |
|---|---|---|---|
| D-01 | Kim HY 2019 *RDE* 44(3):e26；le Cessie 2020 *EJE* 182(2):E1–E3；Fagerland 2012 *BMC Med Res Methodol* 12:78；Ghasemi 2012 *IJEM* 10(2) | Altman 1991 ch.9 | 另附 Delacre 2017 作为**反方**（`does_not_support`） |
| D-02 | Kim HY 2019 *RDE* e26；le Cessie 2020；Fagerland 2012；Kim HY 2014 *RDE* 39(3):235 | Field 5e ch.6 / ch.7 | 另附 Rochon 2012 作为**反方**（`does_not_support`） |
| D-03 | Delacre 2017 *IRSP* 30(1):92–101（核对通过）；Kim HY 2019 *RDE* e26；Kim TK 2015 *KJA* 68(6):540 | Zar 5e ch.8 | 两派出处齐 |
| D-04 | Whitley & Ball 2002 *Crit Care* 6(5):424–428；Kim TK 2015 *KJA* | Altman 1991 ch.9 | Whitley & Ball 的参考文献 [2] 正是 Altman 1991，引用链不断 |
| D-05 | Whitley & Ball 2002 *Crit Care* 6(6):509–513；Kim HY 2014 *RDE* 39(3):235；Kim TK 2015 *KJA* | Field 5e ch.7 | — |

---

### 关于 doctrine 的两派取证（D-01 / D-03 专用）

**pretest-classic 侧（本产品 base doctrine）** —— 可引、可打开、且是「先测再分流」的**正面**表述：

> "The t-test is one of frequently used analysis methods for comparing 2 group means. However, sometimes we forget the underlying assumptions such as normality assumption or miss the meaning of equal variance assumption. Especially when we have a small sample, we need to check normality assumption first and make a decision between the parametric t-test and the nonparametric Mann-Whitney U test. Also, we need to assess the assumption of equal variances and select either Student's t-test or Welch's t-test."
> —— Kim HY 2019, *Restor Dent Endod* 44(3):e26, p. 4/6 结尾段

这一段把 D-01/D-02/D-03 三条规则的分流逻辑一次性写全，是本批**最高价值的单条出处**。
辅证：Kim TK 2015 *KJA* p.544 "Assumptions" 节（Shapiro/K-S → 非参数；Levene/Bartlett → Welch-Satterthwaite）。

**welch-always 侧（用户可选 doctrine）**：

> "The widely recommended two-step approach, where the assumption of equal variances is tested using Levene's test and, based on the outcome of this test, a choice of Student's t-test or Welch's t-test is made, should not be used. Because the statistical power for this test is often low, researchers will inappropriately choose Student's t-test instead of more robust alternatives."
> —— Delacre, Lakens & Leys 2017, *IRSP* 30(1), p. 99, "Conclusion"

⚠️ **Delacre 2017 有一份 2022 年勘误**（Delacre M, Lakens D, Leys C. *Correction*. IRSP. 2022;35(1):11. doi:10.5334/irsp.661，同为 OA）。勘误自述："These mistakes do not affect the main message of our article (Welch's t-test should always be privileged over Student's t-test when we compare groups based on their mean)." —— 主结论不受影响，但**改动了 Yuen's t-test 相关结论与 SDR 的定义**。registry 里引 Delacre 2017 时应同时挂 correction 的 DOI。

**正态性前置检验的反方**（诚实披露用，不作 D-02 的支持出处）：
- Rochon 2012 *BMC Med Res Methodol* 12:81 — "From a formal perspective, preliminary testing for normality is incorrect and should therefore be avoided."
- le Cessie 2020 *EJE* p.E2 — "Some statisticians advise to perform a statistical test for normality, such as the Shapiro–Wilk test, and to let the decision between parametric and non-parametric methods depend on the significance of that test. We disagree with this approach."

> 产品含义：base doctrine 选 pretest-classic 是**审稿依据链**导向的选择，不是统计最优导向的选择。
> doctrine 声明文案里应当把这一点讲出来，否则一旦审稿人手里正好有 Rochon/le Cessie，我们无法自圆。

---

### D-01　两组独立·连续·n≥30·方差齐 → default = student_t

```yaml
D-01:
  citations:
    - id: kim2019-rde-ttest
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-44-e26.pdf"
      cite: "Kim HY. Statistical notes for clinical researchers: the independent samples t-test. Restorative Dentistry & Endodontics. 2019;44(3):e26. doi:10.5395/rde.2019.44.e26"
      locator: "p. 4/6, closing paragraph of 'INDEPENDENT SAMPLES T-TEST'"
      quote: "The t-test is one of frequently used analysis methods for comparing 2 group means. However, sometimes we forget the underlying assumptions such as normality assumption or miss the meaning of equal variance assumption. Especially when we have a small sample, we need to check normality assumption first and make a decision between the parametric t-test and the nonparametric Mann-Whitney U test. Also, we need to assess the assumption of equal variances and select either Student's t-test or Welch's t-test."
    - id: kim2019-rde-levene-branch
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-44-e26.pdf"
      cite: "Kim HY. Statistical notes for clinical researchers: the independent samples t-test. Restor Dent Endod. 2019;44(3):e26."
      locator: "p. 4/6, section '2. Welch's t-test', para. 3"
      quote: "In Appendix 1, '(E-1) Leven's test for equality of variances' shows an equal variance can be successfully assumed (p = 0.334). Therefore, the Welch's t-test is inappropriate for this data."
    - id: lecessie2020-eje
      role: primary
      access: oa
      url: "https://scholarlypublications.universiteitleiden.nl/access/item:3505818/view"
      cite: "le Cessie S, Goeman JJ, Dekkers OM. Who is afraid of non-normal data? Choosing between parametric and non-parametric tests. European Journal of Endocrinology. 2020;182(2):E1-E3. doi:10.1530/EJE-19-0922"
      locator: "p. E1, para. 4"
      quote: "However, many researchers believe that t-tests may only be used when the outcome variable is normally distributed. Fortunately, this is not true. The t-test is not afraid of non-normal data. When there are more than about 25 observations per group and no extreme outliers, the t-test works well even for moderately skewed distributions of the outcome variable."
    - id: fagerland2012-bmcmrm
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445820/"
      cite: "Fagerland MW. t-tests, non-parametric tests, and large studies-a paradox of statistical practice? BMC Medical Research Methodology. 2012;12:78. doi:10.1186/1471-2288-12-78"
      locator: "Abstract - Conclusions"
      quote: "For studies with a large sample size, t-tests and their corresponding confidence intervals can and should be used even for heavily skewed data."
    - id: ghasemi2012-ijem
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3693611/"
      cite: "Ghasemi A, Zahediasl S. Normality tests for statistical analysis: a guide for non-statisticians. International Journal of Endocrinology and Metabolism. 2012;10(2):486-489. doi:10.5812/ijem.3505"
      locator: "Background section"
      quote: "With large enough sample sizes (> 30 or 40), the violation of the normality assumption should not cause major problems"
    - id: delacre2017-irsp-counter
      role: counterpoint
      access: oa
      url: "https://rips-irsp.com/articles/10.5334/irsp.82/"
      cite: "Delacre M, Lakens D, Leys C. Why psychologists should by default use Welch's t-test instead of Student's t-test. International Review of Social Psychology. 2017;30(1):92-101. doi:10.5334/irsp.82"
      locator: "p. 99, Conclusion"
      quote: "The widely recommended two-step approach, where the assumption of equal variances is tested using Levene's test and, based on the outcome of this test, a choice of Student's t-test or Welch's t-test is made, should not be used."
    - id: altman1991-ch9
      role: secondary
      access: print
      cite: "Altman DG. Practical Statistics for Medical Research. 1st ed. London: Chapman & Hall; 1991. Ch. 9 'Comparing groups - continuous data', §9.6"
```

> 注：n≥30 这条阈值的**出处归属**是 Ghasemi 2012（">30 or 40"）与 le Cessie 2020（"more than about 25"）。
> 两者数值不同（25 vs 30/40），registry 里我们取 30 属于**保守取值**，文案不要写成「文献一致规定 30」。

---

### D-02　两组独立·连续·正态性不满足且 min(n)<30 → default = mann_whitney

```yaml
D-02:
  citations:
    - id: kim2019-rde-smalln-nonnormal
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-44-e26.pdf"
      cite: "Kim HY. Statistical notes for clinical researchers: the independent samples t-test. Restorative Dentistry & Endodontics. 2019;44(3):e26. doi:10.5395/rde.2019.44.e26"
      locator: "p. 2/6, section 'INDEPENDENT SAMPLES T-TEST', para. 1"
      quote: "To adopt z- or t-distribution for inference using small samples, a basic assumption is that the distribution of population is not significantly different from normal distribution. As seen in Appendix 1, the normality assumption needs to be tested in advance. If normality assumption cannot be met and we have a small sample (n < 25), then we are not permitted to use 'parametric' t-test. Instead, a non-parametric analysis such as Mann-Whitney U test should be selected."
    - id: lecessie2020-eje-smalln
      role: primary
      access: oa
      url: "https://scholarlypublications.universiteitleiden.nl/access/item:3505818/view"
      cite: "le Cessie S, Goeman JJ, Dekkers OM. Who is afraid of non-normal data? European Journal of Endocrinology. 2020;182(2):E1-E3."
      locator: "p. E2, right column, para. 1"
      quote: "When groups sizes are small (as a rule of thumb: below 25), the outcome variable should be normally distributed to use the t-test. It is difficult to see from observed data whether they are sufficiently normal, because visual tools to detect normality, such as histograms, are not very informative in small samples. Knowledge from other studies can be used to decide if normality may be assumed. If so, the t-test can still be used. Otherwise, a non-parametric statistical test is preferred."
    - id: fagerland2012-smallstudies
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445820/"
      cite: "Fagerland MW. BMC Medical Research Methodology. 2012;12:78."
      locator: "Abstract - Conclusions; Conclusions section"
      quote: "Non-parametric tests are most useful for small studies."
    - id: kim2014-rde-nonparam
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-39-235.pdf"
      cite: "Kim HY. Statistical notes for clinical researchers: Nonparametric statistical methods: 1. Nonparametric methods for comparing two groups. Restorative Dentistry & Endodontics. 2014;39(3):235-239. doi:10.5395/rde.2014.39.3.235"
      locator: "p. 235, 'Nonparametric statistical methods', para. 3"
      quote: "Nonparametric methods may be applied on a wide range of data which is not suitable for the parametric analysis. Severely skewed continuous data or continuous data with definite outliers may be analyzed using nonparametric methods. Small-sized samples which don't guarantee the exact normality need nonparametric methods."
    - id: rochon2012-counter
      role: counterpoint
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3444333/"
      cite: "Rochon J, Gondan M, Kieser M. To test or not to test: preliminary assessment of normality when comparing two independent samples. BMC Medical Research Methodology. 2012;12:81. doi:10.1186/1471-2288-12-81"
      locator: "Results; Conclusions"
      quote: "Preliminary testing for normality seriously altered the conditional Type I error rates of the subsequent main analysis for both parametric and nonparametric tests."
    - id: field5e-ch6-ch7
      role: secondary
      access: print
      cite: "Field A. Discovering Statistics Using IBM SPSS Statistics. 5th ed. London: Sage; 2018. Ch. 6 'The Beast of Bias'; Ch. 7 'Non-parametric models'"
```

> ⚠️ 原 registry 写「Field 5e ch.6」——5e 里 ch.6 是 *The Beast of Bias*（前提/偏差），
> **非参数模型在 ch.7**。两章都要挂，只挂 ch.6 对不上 Mann–Whitney。

---

### D-03　两组独立·连续·方差不齐 → default = welch_t

```yaml
D-03:
  citations:
    - id: delacre2017-irsp
      role: primary
      access: oa
      url: "https://rips-irsp.com/articles/10.5334/irsp.82/"
      cite: "Delacre M, Lakens D, Leys C. Why psychologists should by default use Welch's t-test instead of Student's t-test. International Review of Social Psychology. 2017;30(1):92-101. doi:10.5334/irsp.82"
      locator: "p. 99, 'Conclusion', para. 1 (PDF: https://pure.tue.nl/ws/files/80459772/82_534_3_PB.pdf p.9)"
      quote: "When the assumption of equal variances is not met, Student's t-test yields unreliable results, while Welch's t-test controls Type 1 error rates as expected."
    - id: delacre2017-irsp-levene-power
      role: primary
      access: oa
      url: "https://pure.tue.nl/ws/files/80459772/82_534_3_PB.pdf"
      cite: "Delacre M, Lakens D, Leys C. International Review of Social Psychology. 2017;30(1):92-101."
      locator: "p. 93, 'Different Ways to Test for Equal Variances', right column paras. 3-4"
      quote: "Second, performing two tests (Levene's test followed by a t-test) on the same data makes the alpha level and power of the t-test dependent upon the outcome of Levene's test. When we perform Student's or Welch's t-test conditionally on a significant Levene's test, the long-run Type 1 and Type 2 error rates will depend on the power of Levene's test."
    - id: delacre2017-correction
      role: erratum
      access: oa
      url: "https://rips-irsp.com/articles/10.5334/irsp.661"
      cite: "Delacre M, Lakens D, Leys C. Correction: Why Psychologists Should by Default Use Welch's t-test Instead of Student's t-test. International Review of Social Psychology. 2022;35(1):11. doi:10.5334/irsp.661"
      locator: "Correction notice"
      quote: "These mistakes do not affect the main message of our article (Welch's t-test should always be privileged over Student's t-test when we compare groups based on their mean)."
    - id: kim2019-rde-welch
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-44-e26.pdf"
      cite: "Kim HY. Restorative Dentistry & Endodontics. 2019;44(3):e26."
      locator: "p. 4/6, section '2. Welch's t-test', para. 1"
      quote: "Actually there are a lot of cases where the equal variance cannot be assumed. Even if it is unlikely to assume equal variances, we still compare 2 independent group means by performing the Welch's t-test. Welch's t-test is more reliable when the 2 samples have unequal variances and/or unequal sample sizes. We need to maintain the assumption of normality."
    - id: kimtk2015-kja
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC4667138"
      cite: "Kim TK. T test as a parametric statistic. Korean Journal of Anesthesiology. 2015;68(6):540-546. doi:10.4097/kjae.2015.68.6.540"
      locator: "p. 544, 'Assumptions', para. 4"
      quote: "The condition of equal variance is verified using Levene's test or Bartlett's test. If the condition of equal variance is not met, nonparametric test can be performed or the following statistic which follows a t distribution can be used."
    - id: zar5e-ch8
      role: secondary
      access: print
      cite: "Zar JH. Biostatistical Analysis. 5th ed. Upper Saddle River: Pearson Prentice Hall; 2010. Ch. 8 'Two-Sample Hypotheses', §8.1"
```

---

### D-04　两组配对·连续·差值正态 → default = paired_t

```yaml
D-04:
  citations:
    - id: whitley2002-cc-review5
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC137324"
      cite: "Whitley E, Ball J. Statistics review 5: Comparison of means. Critical Care. 2002;6(5):424-428. doi:10.1186/cc1548"
      locator: "p. 427, section 'Assumptions and limitations', para. 1"
      quote: "In common with other statistical tests, the t-tests presented here require that certain assumptions be made regarding the format of the data. The one sample t-test requires that the data have an approximately Normal distribution, whereas the paired t-test requires that the distribution of the differences are approximately Normal. The unpaired t-test relies on the assumption that the data from the two samples are both Normally distributed, and has the additional requirement that the SDs from the two samples are approximately equal."
    - id: whitley2002-cc-review5-special-case
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC137324"
      cite: "Whitley E, Ball J. Critical Care. 2002;6(5):424-428."
      locator: "p. 426, 'Comparison of two means arising from paired data', para. 3"
      quote: "The appropriate t-test therefore compares the observed mean of the differences with a hypothesized value of 0. In other words, the paired t-test is simply a special case of the single sample t-test described above."
    - id: kimtk2015-kja-paired
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC4667138"
      cite: "Kim TK. T test as a parametric statistic. Korean Journal of Anesthesiology. 2015;68(6):540-546."
      locator: "p. 544, section 'Paired T test', para. 1"
      quote: "Paired t tests are can be categorized as a type of t test for a single sample because they test the difference between two paired results."
    - id: whitley2002-cc-review6-power
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC153434"
      cite: "Whitley E, Ball J. Statistics review 6: Nonparametric methods. Critical Care. 2002;6(6):509-513. doi:10.1186/cc1820"
      locator: "p. 513, 'Disadvantages of nonparametric methods', para. 1"
      quote: "Nonparametric methods may lack power as compared with more traditional approaches. This is a particular concern if the sample size is small or if the assumptions for the corresponding parametric method (e.g. Normality of the data) hold."
    - id: altman1991-ch9
      role: secondary
      access: print
      cite: "Altman DG. Practical Statistics for Medical Research. 1st ed. London: Chapman & Hall; 1991. Ch. 9"
```

> 💡 换源附加收益：Whitley & Ball 2002 在 "Assumptions and limitations" 一节里，把「有正式检验可查正态/方差齐」这件事的参考文献 **[2] 明确指向 Altman 1991**。
> 也就是说 primary 换成这篇 OA 之后，**Altman 仍在引用链上**，审稿人追溯得到，教科书降级不掉权威。

---

### D-05　两组配对·连续·差值非正态 → default = wilcoxon

```yaml
D-05:
  citations:
    - id: whitley2002-cc-review6-opening
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC153434"
      cite: "Whitley E, Ball J. Statistics review 6: Nonparametric methods. Critical Care. 2002;6(6):509-513. doi:10.1186/cc1820"
      locator: "p. 509, opening paragraph"
      quote: "Many statistical methods require assumptions to be made about the format of the data to be analysed. For example, the paired t-test introduced in Statistics review 5 requires that the distribution of the differences be approximately Normal, while the unpaired t-test requires an assumption of Normality to hold separately for both sets of observations. Fortunately, these assumptions are often valid in clinical data, and where they are not true of the raw data it is often possible to apply a suitable transformation. There are situations in which even transformed data may not satisfy the assumptions, however, and in these cases it may be inappropriate to use traditional (parametric) methods of analysis."
    - id: whitley2002-cc-review6-mapping
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC153434"
      cite: "Whitley E, Ball J. Critical Care. 2002;6(6):509-513."
      locator: "p. 512, 'The Wilcoxon rank sum or Mann-Whitney test', para. 1"
      quote: "The sign test and Wilcoxon signed rank test are useful nonparametric alternatives to the one-sample and paired t-tests. A nonparametric alternative to the unpaired t-test is given by the Wilcoxon rank sum test, which is also known as the Mann-Whitney test."
    - id: kim2014-rde-table1
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-39-235.pdf"
      cite: "Kim HY. Statistical notes for clinical researchers: Nonparametric statistical methods: 1. Nonparametric methods for comparing two groups. Restorative Dentistry & Endodontics. 2014;39(3):235-239. doi:10.5395/rde.2014.39.3.235"
      locator: "p. 236, para. 1 + Table 1, row 2 (Correlated two groups | Paired t-test | Wilcoxon signed-rank test)"
      quote: "Table 1 shows parametric methods and nonparametric methods for comparing independent two groups and correlated two groups. The Wincoxon rank-sum test (or the Mann-Whitney U test) is comparable to the independent t-test as the Wilcoxon signed-rank test is to the paired t-test."
    - id: kim2014-rde-powerloss
      role: primary
      access: oa
      url: "https://www.rde.ac/upload/pdf/rde-39-235.pdf"
      cite: "Kim HY. Restorative Dentistry & Endodontics. 2014;39(3):235-239."
      locator: "p. 235, 'Disadvantages of nonparametric methods', item 1)"
      quote: "Applying nonparametric methods on data satisfying assumptions of parametric methods may result in less power. However loss of power may be little or none for analysis of data which cannot satisfy the assumptions."
    - id: kimtk2015-kja-signrank
      role: primary
      access: oa
      url: "https://europepmc.org/articles/PMC4667138"
      cite: "Kim TK. T test as a parametric statistic. Korean Journal of Anesthesiology. 2015;68(6):540-546."
      locator: "p. 544, 'Assumptions', para. 3"
      quote: "Shapiro's test or the Kolmogorov-Smirnov test can be performed to verify the assumption of normality. If the condition of normality is not met, the Wilcoxon rank sum test (Mann-Whitney U test) is used for independent samples, and the Wilcoxon sign rank test is used for paired samples for an additional nonparametric test."
    - id: field5e-ch7
      role: secondary
      access: print
      cite: "Field A. Discovering Statistics Using IBM SPSS Statistics. 5th ed. London: Sage; 2018. Ch. 7 'Non-parametric models'"
```

> 逐字摘录里的两处排印异常均为**原文原样**，不要「顺手改对」：
> Kim 2014 p.236 的 `Wincoxon`（期刊错字）、Kim TK 2015 p.544 的 `Paired t tests are can be`（多余 are）。
> 自动核对器做字符串比对时会命中这两处，需在 fixture 里注明 `verbatim: true`。

---

### 未落实项（详见 `unresolved`）

1. **Rasch/Kubinger/Moder 2011**、**Zimmerman 2004**、**Ruxton 2006** —— 三篇 welch-always 派的经典全部**无 OA 全文**。
   处理方式：不作独立可核对出处；其关键结论由 OA 的 Delacre 2017 逐字转述并显式引用，核对器可沿 Delacre 追溯。
2. **中文 OA 方法学出处未落实**。找到的两条中文线索一条不可引（无署名转载稿）、一条打不开全文且结论与 D-02 相反
   （《数理医药学杂志》2023;36(7):481–485：极小样本下不建议用 Wilcoxon）。这条**冲突值得单独立项**，
   因为它直接指向 D-02 在 min(n) 极小（如 n≤6）时默认值可能不当 —— 建议给 D-02 加一条下界护栏，
   而不是把这条文献塞进支持出处里凑数。


---

## 二 · D-06 / D-07 / D-08 / D-18（方差分析与线性回归）

## D-06 / D-07 / D-08 / D-18 —— 方差分析与线性回归：出处改写（OA primary）

> 本批全部 primary 均已 **WebFetch / curl 取到全文并本地 `pdftotext` 复核**，
> 摘录为逐字英文原文，无转述。下方每条都注明节号/页码。
> 教科书未删除，一律降为 `secondary`，章号用**出版社官方目录**核对过
> （Zar 5e，Pearson New International Edition，`toc_9781292037110.pdf`：
> ch.10 = Multisample Hypotheses and the Analysis of Variance；ch.11 = Multiple Comparisons；ch.17 = Simple Linear Regression）。

### 检索留痕（含一次未遂的伪造）

⚠️ 过程中 `tqmp.org/RegularArticles/vol19-3/p281/p281.pdf` 的自动抽取**返回了一条完全捏造的引文**
（虚构作者 "Sawada M. (2024). Welch's ANOVA vs. classical F-test and Kruskal-Wallis test…"、
虚构页码 281–295、虚构结论句 "Welch's ANOVA should be the default choice"）。
本地 `pdftotext` 打开后实际是 **Sawada T. (2023), TQMP 19(3), 6 页，讲 Bayesian 重复测量模型的
等方差/i.i.d. 违反**，与 Welch/Kruskal 比较无关。该条已整条丢弃，**未进入任何卡片**。
自此之后本批所有 PDF 一律先 `curl` 下载再本地抽文本，HTML 源一律走 Europe PMC full-text XML 或 curl 原始页。

---

### D-06 ≥3 组独立 · 连续 · 正态 + 方差齐 → `allowed[anova]`, `default=anova`

**primary（OA）**：Bewick V, Cheek L, Ball J. *Statistics review 9: One-way analysis of variance.*
Critical Care. 2004;8(2):130–136. doi:10.1186/cc2836 — https://pmc.ncbi.nlm.nih.gov/articles/PMC420045/

> **§ Introduction**
> "Analysis of variance (often referred to as ANOVA) is a technique for analyzing the way in which the mean of a variable is affected by different types and combinations of factors. One-way analysis of variance is the simplest form. It is an extension of the independent samples t-test (see statistics review 5 [1]) and can be used to compare any number of groups or treatments."
>
> **§ Assumptions and limitations**
> "The underlying assumptions for one-way analysis of variance are that the observations are independent and randomly selected from Normal populations with equal variances. It is not necessary to have equal sample sizes. ... If the assumptions are not met then it may be possible to transform the data. Alternatively the Kruskal-Wallis nonparametric test could be used."

**primary 补强（OA）**：Kim H-Y. *Analysis of variance (ANOVA) comparing means of more than two groups.*
Restor Dent Endod. 2014;39(1):74–77. doi:10.5395/rde.2014.39.1.74 — https://rde.ac/journal/view.php?doi=10.5395%2Frde.2014.39.1.74

> "For a comparison of more than two group means the one-way analysis of variance (ANOVA) is the appropriate method instead of the t test."
> （前文界定假设："...the parametric Student's t test when independent groups are subjected to the comparison under the assumptions of normal distribution and equal variances (or standard deviation)."）

**🔴 必须同时登记的分歧（OA）**：Delacre et al. 2019（见 D-07）在同一问题上主张
**即使方差齐也应默认 Welch**。其 § Conclusions 第 1–2 条同时证明了「假设全满足时 F 检验没问题」：

> "1) When all assumptions are met, all tests perform adequately. 2) When variances are equal between groups and distributions are not normal, the W-test is a little less efficient than both the F-test and the F*-test, but departures from the nominal 5% Type I error rate never exceed the liberal criterion of Bradley (1978)."

也就是说 `default=anova` 在方差齐条件下**是有效的**，但**不是文献共识的最优默认**。建议卡片加 `dissent` 角色而不是隐藏。

```yaml
D-06:
  citations:
    - id: bewick2004-anova
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC420045/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 9: One-way analysis of variance. Critical Care. 2004;8(2):130-136. doi:10.1186/cc2836"
      locator: "§ Assumptions and limitations; § Introduction (pp. 130-131)"
      quote: "The underlying assumptions for one-way analysis of variance are that the observations are independent and randomly selected from Normal populations with equal variances."
    - id: kim2014-anova
      role: primary
      access: oa
      url: "https://rde.ac/journal/view.php?doi=10.5395%2Frde.2014.39.1.74"
      cite: "Kim HY. Analysis of variance (ANOVA) comparing means of more than two groups. Restor Dent Endod. 2014;39(1):74-77. doi:10.5395/rde.2014.39.1.74"
      locator: "正文第3-4段 (p. 74)"
      quote: "For a comparison of more than two group means the one-way analysis of variance (ANOVA) is the appropriate method instead of the t test."
    - id: delacre2019-dissent
      role: dissent
      access: oa
      url: "https://rips-irsp.com/articles/198/files/submission/proof/198-1-2046-1-10-20190801.pdf"
      cite: "Delacre M, Leys C, Mora YL, Lakens D. Taking Parametric Assumptions Seriously. International Review of Social Psychology. 2019;32(1):13, 1-12. doi:10.5334/irsp.198"
      locator: "§ Conclusions, 第1-2条 (pp. 8-9); § Recommendations (p. 10)"
      quote: "When all assumptions are met, all tests perform adequately."
    - id: zar5e-ch10
      role: secondary
      access: print
      cite: "Zar JH. Biostatistical Analysis. 5th ed. Pearson; ch. 10 Multisample Hypotheses and the Analysis of Variance"
```

---

### D-07 ≥3 组独立 · 连续 · 正态 + 方差不齐 → `allowed[welch_anova]`, `default=welch_anova`

**primary（OA, CC-BY）**：Delacre M, Leys C, Mora YL, Lakens D.
*Taking Parametric Assumptions Seriously: Arguments for the Use of Welch's F-test instead of the Classical F-test in One-Way ANOVA.*
International Review of Social Psychology. 2019;32(1):13, 1–12. doi:10.5334/irsp.198
— https://rips-irsp.com/articles/10.5334/irsp.198 （PDF：`/articles/198/files/submission/proof/198-1-2046-1-10-20190801.pdf`）

> **§ Recommendations（p. 10）**
> "Taking both the effects of the assumption violations on the alpha risk and on the power, we recommend using the W-test instead of the F-test to compare groups means. The F-test and F*-test should be avoided, because a) the equal variances assumption is often unrealistic, b) tests of the equal variances assumption will often fail to detect differences when these are present, c) the loss of power when using the W-test is very small (and often even negligible), and d) the gain in Type I error control is considerable under a wide range of realistic conditions."
>
> **§ Violation of Homogeneity of Variances Assumption（p. 3）**
> "When there are more than two groups, the F-test becomes more liberal, meaning that the Type I error rate is larger than the nominal alpha level, even when sample sizes are equal across groups (Tomarken & Serlin, 1986)."
>
> **§ Conclusions 第 3 条（p. 9）**
> "When the assumption of equal variances is violated, the W-test clearly outperforms both the F*-test (which is more liberal) and the F-test (which is either more liberal or more conservative, depending on the SDs and SD pairing)."

**primary 补强（OA，医学口径，可用于医科 Methods 段）**：Kroeger CM, Ejima K, … Allison DB.
*Persistent confusion in nutrition and obesity research about the validity of classic nonparametric tests in the presence of heteroscedasticity.*
Am J Clin Nutr. 2021;113(3):517–524. doi:10.1093/ajcn/nqaa357 — https://pmc.ncbi.nlm.nih.gov/articles/PMC7948897/

> **§ Welch's ANOVA** — "Welch's ANOVA (sometimes called Welch's F test) is designed to be robust in the presence of normality and when the homogeneity of variance assumption does not hold."
> **§ Conclusion** — "Our simulations indicated that Kruskal–Wallis and Fisher's 1-factor ANOVA tests provide (in many cases positively) biased type I error rates in the presence of heteroscedasticity, whereas Welch's 1-factor ANOVA does not."

**🔴 Welch 1951 的可及性结论：付费墙，无 OA 副本。**
OUP 页面实测仅有首页缩略图 + "This content is only available as a PDF" + "You do not currently have access to this article."（24h 租阅 USD 43）；JSTOR 同样付费；1951 年早于任何自存档制度，PMC/arXiv/DOAJ/机构库均无。
→ **不要把它当 primary**；降为 `origin`（历史发明出处，`access: paywalled`），可核对的 primary 用 Delacre 2019。

```yaml
D-07:
  citations:
    - id: delacre2019-welch
      role: primary
      access: oa
      url: "https://rips-irsp.com/articles/198/files/submission/proof/198-1-2046-1-10-20190801.pdf"
      cite: "Delacre M, Leys C, Mora YL, Lakens D. Taking Parametric Assumptions Seriously: Arguments for the Use of Welch's F-test instead of the Classical F-test in One-Way ANOVA. International Review of Social Psychology. 2019;32(1):13, 1-12. doi:10.5334/irsp.198"
      locator: "§ Recommendations (p. 10)"
      quote: "Taking both the effects of the assumption violations on the alpha risk and on the power, we recommend using the W-test instead of the F-test to compare groups means."
    - id: kroeger2021-hetero
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7948897/"
      cite: "Kroeger CM, Ejima K, et al. Persistent confusion in nutrition and obesity research about the validity of classic nonparametric tests in the presence of heteroscedasticity. Am J Clin Nutr. 2021;113(3):517-524. doi:10.1093/ajcn/nqaa357"
      locator: "§ Welch's ANOVA; § Conclusion"
      quote: "Welch's ANOVA (sometimes called Welch's F test) is designed to be robust in the presence of normality and when the homogeneity of variance assumption does not hold."
    - id: welch1951
      role: origin
      access: paywalled
      url: "https://academic.oup.com/biomet/article/38/3-4/330/257875"
      cite: "Welch BL. On the comparison of several mean values: an alternative approach. Biometrika. 1951;38(3-4):330-336."
      locator: "pp. 330-336"
      note: "实测无 OA 全文（OUP/JSTOR 均付费，无仓储副本）。仅作历史出处，不作为可核对依据。"
    - id: zar5e-ch10
      role: secondary
      access: print
      cite: "Zar JH. Biostatistical Analysis. 5th ed. Pearson; ch. 10 Multisample Hypotheses and the Analysis of Variance（不等方差多样本检验一节）"
```

---

### D-08 ≥3 组独立 · 连续 · 非正态 → `allowed[kruskal, welch_anova]`, `default=kruskal`

**primary（OA）**：Bewick V, Cheek L, Ball J. *Statistics review 10: Further nonparametric methods.*
Critical Care. 2004;8(3):196–199. doi:10.1186/cc2857 — https://pmc.ncbi.nlm.nih.gov/articles/PMC468904/

> **§ Introduction**
> "The previous review in this series [1] described analysis of variance, the method used to test for differences between more than two groups or treatments. However, in order to use analysis of variance, the observations are assumed to have been selected from Normally distributed populations with equal variance. The tests described in this review require only limited assumptions about the data. The Kruskal–Wallis test is the nonparametric alternative to one-way analysis of variance, which is used to test for differences between more than two populations when the samples are independent."
>
> **§ Kruskal–Wallis test**
> "The Kruskal–Wallis test is an extension of the Mann–Whitney test [2] for more than two independent samples. It is the nonparametric alternative to one-way analysis of variance. Instead of comparing population means, this method compares population mean ranks (i.e. medians)."

**primary 补强（OA，决策规则形态，最贴近本注册表结构）**：Mishra P, Pandey CM, Singh U, Keshri A, Sabaretnam M.
*Selection of appropriate statistical methods for data analysis.* Ann Card Anaesth. 2019;22(3):297–301.
doi:10.4103/aca.ACA_248_18 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6639881/

> **§ Type and distribution of the data used**（配 Table 1 "Parametric and their alternative nonparametric methods"）
> "In above example, one-way ANOVA test is used to compare the means when DBP follows normal distribution while Kruskal–Wallis H tests/median tests are used to compare the distribution of DBP among three age groups when DBP follows non-normal distribution."

#### 🔴 D-08 的默认值有三条 OA 反证，必须登记

1. **Blanca MJ, Alarcón R, Arnau J, Bono R, Bendayan R.** *Non-normal data: Is ANOVA still a valid option?*
   Psicothema. 2017;29(4):552–557. doi:10.7334/psicothema2016.383 —
   https://www.redalyc.org/pdf/727/72753218018.pdf
   > 摘要 Results（p. 552）："The results showed that in terms of Type I error the F-test was robust in 100% of the cases studied, independently of the manipulated conditions."
   > § Discussion（p. 555）："There are also disadvantages to using non-parametric procedures such as the Kruskal-Wallis test. This test converts quantitative continuous data into rank-ordered data, with a consequent loss of information. Moreover, the null hypothesis associated with the Kruskal-Wallis test differs from that of F-test, unless the distribution of groups has exactly the same shape (see Maxwell & Delaney, 2004). **Given these limitations, there is no reason to prefer the Kruskal-Wallis test under the conditions studied in the present paper.**"

2. **Kroeger 2021（同 D-07）§ Kruskal–Wallis test**：
   > "When the assumption of homogeneity of variance fails, some researchers erroneously substitute a nonparametric test, such as the Kruskal–Wallis test, that relies on the ordered ranks of the data."
   > "In many cases, utilizing the Kruskal–Wallis test when variance heterogeneity is present will result in an increased type I error rate for testing differences in central tendency, often expressed at the median (10, 12)."

3. **Fagerland MW.** *t-tests, non-parametric tests, and large studies—a paradox of statistical practice?*
   BMC Med Res Methodol. 2012;12:78. doi:10.1186/1471-2288-12-78 — https://pmc.ncbi.nlm.nih.gov/articles/PMC3445820/
   > Abstract § Conclusions："Non-parametric tests are most useful for small studies. Using non-parametric tests in large studies may provide answers to the wrong question, thus confusing readers. For studies with a large sample size, t-tests and their corresponding confidence intervals can and should be used even for heavily skewed data."
   > § Discussion："First, medical research authors may use a test for normality to decide whether to use a t-test or a non-parametric test. **We strongly advise against that practice.**"

**含义（需产品决策，不由本批擅自改）**：`default=kruskal` 在 OA 一次文献里**只有惯例级支持，没有比较级支持**。
建议二选一：
- (a) 把 D-08 拆成条件分叉：非正态 **且方差不齐** → `welch_anova`；非正态 **且方差齐且 n 小** → `kruskal`；n 大 → `anova/welch_anova` 也在 allowed 且不劣；
- (b) 保持现状但在卡片上标 `evidence_grade: convention`，并把上面三条挂成 `dissent`。

**secondary 章号勘误**：现卡片写 "Zar ch.11" 与出版社官方目录不符 —— **ch.11 是 Multiple Comparisons**，
Kruskal–Wallis（非参数方差分析）在 **ch.10**。

```yaml
D-08:
  citations:
    - id: bewick2004-nonparam
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC468904/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 10: Further nonparametric methods. Critical Care. 2004;8(3):196-199. doi:10.1186/cc2857"
      locator: "§ Introduction; § Kruskal–Wallis test (pp. 196-197)"
      quote: "The Kruskal–Wallis test is the nonparametric alternative to one-way analysis of variance, which is used to test for differences between more than two populations when the samples are independent."
    - id: mishra2019-select
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6639881/"
      cite: "Mishra P, Pandey CM, Singh U, Keshri A, Sabaretnam M. Selection of appropriate statistical methods for data analysis. Ann Card Anaesth. 2019;22(3):297-301. doi:10.4103/aca.ACA_248_18"
      locator: "§ Type and distribution of the data used; Table 1"
      quote: "one-way ANOVA test is used to compare the means when DBP follows normal distribution while Kruskal–Wallis H tests/median tests are used to compare the distribution of DBP among three age groups when DBP follows non-normal distribution"
    - id: blanca2017-anova-nonnormal
      role: dissent
      access: oa
      url: "https://www.redalyc.org/pdf/727/72753218018.pdf"
      cite: "Blanca MJ, Alarcón R, Arnau J, Bono R, Bendayan R. Non-normal data: Is ANOVA still a valid option? Psicothema. 2017;29(4):552-557. doi:10.7334/psicothema2016.383"
      locator: "§ Discussion (p. 555)"
      quote: "Given these limitations, there is no reason to prefer the Kruskal-Wallis test under the conditions studied in the present paper."
    - id: kroeger2021-kw
      role: dissent
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7948897/"
      cite: "Kroeger CM, Ejima K, et al. Am J Clin Nutr. 2021;113(3):517-524. doi:10.1093/ajcn/nqaa357"
      locator: "§ Kruskal–Wallis test"
      quote: "In many cases, utilizing the Kruskal–Wallis test when variance heterogeneity is present will result in an increased type I error rate for testing differences in central tendency, often expressed at the median"
    - id: fagerland2012-paradox
      role: dissent
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445820/"
      cite: "Fagerland MW. t-tests, non-parametric tests, and large studies—a paradox of statistical practice? BMC Med Res Methodol. 2012;12:78. doi:10.1186/1471-2288-12-78"
      locator: "Abstract § Conclusions"
      quote: "Non-parametric tests are most useful for small studies. Using non-parametric tests in large studies may provide answers to the wrong question, thus confusing readers."
    - id: zar5e-ch10-np
      role: secondary
      access: print
      cite: "Zar JH. Biostatistical Analysis. 5th ed. Pearson; ch. 10 Multisample Hypotheses and the Analysis of Variance（非参数方差分析/Kruskal–Wallis 一节）"
      note: "勘误：原卡片写的 ch.11 是 Multiple Comparisons，不含 Kruskal–Wallis"
```

---

### D-18 连续结局 + ≥1 自变量 → `ols_linear`

**primary（OA, CC-BY）**：Ernst AF, Albers CJ.
*Regression assumptions in clinical psychology research practice—a systematic review of common misconceptions.*
PeerJ. 2017;5:e3323. doi:10.7717/peerj.3323 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5436580/

> **§ Introduction（开篇句 — 直接对应本规则的触发条件）**
> "One of the most frequently employed models to express the influence of several predictors on a continuous outcome variable is the linear regression model: Yi = β0 + β1X1i + β2X2i + ⋯ + βpXpi + εi."
>
> **§ Introduction（"Below, the four OLS-assumptions will be discussed."）**
> "Linearity. The conditional mean of the errors is assumed to be zero for any given combination of values of the predictor variables."
> "Normality. All errors are normally distributed around zero."
> "Homoscedasticity. The variance of the errors is the same for any combination of values of the independent variables."
> "Independence. The errors ε1, ε2, …, should be independent of one another: the pairwise covariances should be zero."
>
> **§ Common misconceptions about assumptions（写进产品文案很有用）**
> "Most commonly, researchers incorrectly assume that Xi, or both Xi and Y, should be normally distributed, rather than the errors of the model."

**primary 补强（OA，医学口径）**：Schneider A, Hommel G, Blettner M.
*Linear regression analysis: part 14 of a series on evaluation of scientific publications.*
Dtsch Arztebl Int. 2010;107(44):776–782. doi:10.3238/arztebl.2010.0776
— https://pmc.ncbi.nlm.nih.gov/articles/PMC2992018/ ｜ PDF：https://api.aerzteblatt.de/pdf/DI/107/44/m776.pdf

> **§ Methods（p. 776 左栏）**
> "Linear regression is used to study the linear relationship between a dependent variable Y (blood pressure) and one or more independent variables X (age, weight, sex). The dependent variable Y must be continuous, while the independent variables may be either continuous (age), binary (sex), or categorical (social status)."
> "Performing a linear regression makes sense only if the relationship is linear."
> （Table 1 "Regression models" 把 Linear regression 的 Dependent variables 一栏写作 "Continuous (weight, blood pressure)"）

```yaml
D-18:
  citations:
    - id: ernst2017-regassump
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5436580/"
      cite: "Ernst AF, Albers CJ. Regression assumptions in clinical psychology research practice—a systematic review of common misconceptions. PeerJ. 2017;5:e3323. doi:10.7717/peerj.3323"
      locator: "§ Introduction（开篇句 + 四条 OLS 假设分段）"
      quote: "One of the most frequently employed models to express the influence of several predictors on a continuous outcome variable is the linear regression model"
    - id: schneider2010-linreg
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2992018/"
      cite: "Schneider A, Hommel G, Blettner M. Linear regression analysis: part 14 of a series on evaluation of scientific publications. Dtsch Arztebl Int. 2010;107(44):776-782. doi:10.3238/arztebl.2010.0776"
      locator: "§ Methods, p. 776 左栏; Table 1 Regression models"
      quote: "The dependent variable Y must be continuous, while the independent variables may be either continuous (age), binary (sex), or categorical (social status)."
    - id: zar5e-ch17
      role: secondary
      access: print
      cite: "Zar JH. Biostatistical Analysis. 5th ed. Pearson; ch. 17 Simple Linear Regression"
    - id: kutner-alsm5e
      role: secondary
      access: print
      cite: "Kutner MH, Nachtsheim CJ, Neter J, Li W. Applied Linear Statistical Models. 5th ed. McGraw-Hill/Irwin; ch. 1-3"
```

---

### 本批 OA 覆盖率

| 规则 | 原 primary | 新 primary | 可核对 |
|---|---|---|---|
| D-06 | Zar 5e ch.10（纸质） | Bewick 2004 Crit Care + Kim 2014 RDE | ✅ 两条全文 |
| D-07 | Welch 1951（付费）+ Zar | Delacre 2019 IRSP + Kroeger 2021 AJCN | ✅ 两条全文；Welch 1951 降 `origin/paywalled` |
| D-08 | Zar 5e ch.11（纸质，且章号有误） | Bewick 2004 Stat review 10 + Mishra 2019 | ⚠️ 全文可核对，但**默认值本身缺比较级证据**，附 3 条 dissent |
| D-18 | 待定 | Ernst & Albers 2017 PeerJ + Schneider 2010 | ✅ 两条全文 |


---

## 三 · logistic / 生存 / 信效度(D-16, D-17, D-19, D-20, D-21, D-22)

## 方法卡出处改写:logistic / 生存 / 信效度(D-16, D-17, D-19~D-22)

> **改写口径**:primary 一律换成「能真正打开全文」的开放获取文献(PMC / 期刊官方免费页 / 作者自存档);
> 教科书全部降为 `secondary`(保留版次与章节,审稿人仍认)。每条 quote 均为**逐字英文原文**,
> 已通过 WebFetch 打开全文核对(部分 PDF 经本地逐页渲染核对,定位到页码)。
>
> 🔴 **本批有三条规则的阈值数字在文献里站不住**,已在各自小节顶部用 ⚠️ 标出,并给出建议改法。
> 不要把这些数字写进 Methods 段的引文里假装有出处。

---

### D-16 二分结局 + ≥1 自变量 → logistic

**改写结论:`supports`。** 现引的 Hosmer & Lemeshow 2013 是纸质付费书,AI 评审拿不到;
换成两条 PMC 全文,其中 Bewick 2005 的摘要首句几乎是这条规则的英文原文。

**Primary(OA,PMC)**

> Bewick V, Cheek L, Ball J. *Statistics review 14: Logistic regression.* **Critical Care.** 2005;9(1):112–118. doi:10.1186/cc3045
> https://pmc.ncbi.nlm.nih.gov/articles/PMC1065119/

- **Abstract 第 1 句**:
  > "This review introduces logistic regression, which is a method for modelling the dependence of a binary response variable on one or more explanatory variables."
- **Introduction**:
  > "Logistic regression provides a method for modelling a binary response variable, which takes values 1 and 0."
- **Introduction(为什么不能直接线性回归)**:
  > "the probability of death changes very little at the high or low extremes of marker level. This pattern is typical because proportions cannot lie outside the range from 0 to 1."

**Primary 补充(OA,PMC,CC-BY)**

> Sperandei S. *Understanding logistic regression analysis.* **Biochemia Medica.** 2014;24(1):12–18. doi:10.11613/BM.2014.003
> https://pmc.ncbi.nlm.nih.gov/articles/PMC3936971/

- **Abstract / 正文**:
  > "Logistic regression is used to obtain odds ratio in the presence of more than one explanatory variable. The procedure is quite similar to multiple linear regression, with the exception that the response variable is binomial."
- **正文**:
  > "The greatest advantage when compared to Mantel-Haenszel OR is the fact that you can use continuous explanatory variables and it is easier to handle more than two explanatory variables simultaneously."

```yaml
D-16:
  citations:
    - id: bewick2005-logistic
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1065119/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 14: Logistic regression. Critical Care. 2005;9(1):112-118. doi:10.1186/cc3045"
      locator: "Abstract 第1句;Introduction 第1、3段"
      quote: "This review introduces logistic regression, which is a method for modelling the dependence of a binary response variable on one or more explanatory variables."
    - id: sperandei2014-logistic
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3936971/"
      cite: "Sperandei S. Understanding logistic regression analysis. Biochemia Medica. 2014;24(1):12-18. doi:10.11613/BM.2014.003"
      locator: "Abstract;正文 'Logistic regression' 一节"
      quote: "Logistic regression is used to obtain odds ratio in the presence of more than one explanatory variable. The procedure is quite similar to multiple linear regression, with the exception that the response variable is binomial."
    - id: hosmer2013-alr3
      role: secondary
      access: print
      cite: "Hosmer DW Jr, Lemeshow S, Sturdivant RX. Applied Logistic Regression. 3rd ed. Wiley; 2013. Chapter 1 'Introduction to the Logistic Regression Model', §1.1-1.2"
    - id: agresti2013-cda3
      role: secondary
      access: print
      cite: "Agresti A. Categorical Data Analysis. 3rd ed. Wiley; 2013. Chapter 5 'Logistic Regression'"
```

---

### D-17 EPV < 5 → blocked + 建议 fisher / 精简变量

> ⚠️ **两处与文献对不上,建议改卡片而不是硬找出处:**
> 1. **没有任何 OA(乃至付费)文献主张「EPV<5 一律 block」。** 现代方法学的方向恰恰相反 ——
>    van Smeden 2016 的题目就是「EPV=10 这条规则没有理据」。可诚实引用的最强 OA 陈述是它在
>    Background 里转述 Vittinghoff & McCulloch 的结论:严重问题**主要出现在 EPV = 2 到 4 之间**。
>    这为「阈值定在 5 附近」提供了间接支撑,但**不能写成「文献建议 EPV<5 时拒绝拟合」**。
> 2. **fallback 写 `fisher` 找不到任何出处。** 文献一致的低 EPV 对策是 **Firth 惩罚似然**
>    (或减少候选变量)。**建议把 fallback 从 `fisher` 改为 `firth_logistic`** —— 改完这条规则
>    的出处链就完整了,不改就得永远挂 `partially_supports`。

**Primary(OA,PMC,CC-BY)**

> van Smeden M, de Groot JAH, Moons KGM, Collins GS, Altman DG, Eijkemans MJC, Reitsma JB.
> *No rationale for 1 variable per 10 events criterion for binary logistic regression analysis.*
> **BMC Medical Research Methodology.** 2016;16:163. doi:10.1186/s12874-016-0267-3
> https://pmc.ncbi.nlm.nih.gov/articles/PMC5122171/

- **Background(低 EPV 的危险区间 —— 这是支撑阈值≈5 的关键句)**:
  > "Vittinghoff and McCulloch have argued that an EPV of 10 as a minimal guideline criterion is too conservative, showing that severe problems mainly occur in the EPV = 2 to EPV = 4 range."
- **Background(低 EPV 的估计偏倚)**:
  > "Earlier studies have demonstrated that the associations between covariates and the outcome estimated by logistic regression are often imprecise and biased in the direction of more extreme values when EPV is low."
- **Background(separation)**:
  > "When separation occurs, the maximum likelihood estimation fails."
  > "The probability of separation occurring increases with decreasing sample size and increasing number of covariates. Hence, separation is likely to occur in low EPV data sets."
- **Discussion(正确的 fallback)**:
  > "By applying Firth's correction, the problems associated with separation can be avoided."
- **Abstract – Conclusions(必须一并引用,否则是断章取义)**:
  > "The current evidence supporting EPV rules for binary logistic regression is weak."

**Primary 补充(OA,PMC)——「EPV 不是合适的样本量判据」的正式结论**

> van Smeden M, Moons KGM, de Groot JAH, Collins GS, Altman DG, Eijkemans MJC, Reitsma JB.
> *Sample size for binary logistic prediction models: Beyond events per variable criteria.*
> **Statistical Methods in Medical Research.** 2019;28(8):2455–2474. doi:10.1177/0962280218784726
> https://pmc.ncbi.nlm.nih.gov/articles/PMC6710621/

- **Abstract – Conclusions**:
  > "EPV does not have a strong relation with metrics of predictive performance, and is not an appropriate criterion for (binary) prediction model development studies."
  > "the recommended minimal EPV criteria for prediction model development, notably the EPV ≥10 rule, falls short of providing appropriate sample size guidance."

```yaml
D-17:
  citations:
    - id: vansmeden2016-epv
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5122171/"
      cite: "van Smeden M, de Groot JAH, Moons KGM, Collins GS, Altman DG, Eijkemans MJC, Reitsma JB. No rationale for 1 variable per 10 events criterion for binary logistic regression analysis. BMC Med Res Methodol. 2016;16:163. doi:10.1186/s12874-016-0267-3"
      locator: "Background(低 EPV 危险区间 / separation);Discussion(Firth);Abstract-Conclusions"
      quote: "Vittinghoff and McCulloch have argued that an EPV of 10 as a minimal guideline criterion is too conservative, showing that severe problems mainly occur in the EPV = 2 to EPV = 4 range."
    - id: vansmeden2016-firth
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5122171/"
      cite: "van Smeden M, et al. BMC Med Res Methodol. 2016;16:163."
      locator: "Background(separation 频率);Discussion(对策)"
      quote: "The probability of separation occurring increases with decreasing sample size and increasing number of covariates. Hence, separation is likely to occur in low EPV data sets. […] By applying Firth's correction, the problems associated with separation can be avoided."
    - id: vansmeden2019-beyondepv
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6710621/"
      cite: "van Smeden M, Moons KGM, de Groot JAH, et al. Sample size for binary logistic prediction models: Beyond events per variable criteria. Stat Methods Med Res. 2019;28(8):2455-2474. doi:10.1177/0962280218784726"
      locator: "Abstract - Conclusions;Discussion"
      quote: "EPV does not have a strong relation with metrics of predictive performance, and is not an appropriate criterion for (binary) prediction model development studies."
    - id: peduzzi1996-epv10
      role: secondary
      access: print
      cite: "Peduzzi P, Concato J, Kemper E, Holford TR, Feinstein AR. A simulation study of the number of events per variable in logistic regression analysis. J Clin Epidemiol. 1996;49(12):1373-1379"
    - id: hosmer2013-samplesize
      role: secondary
      access: print
      cite: "Hosmer DW Jr, Lemeshow S, Sturdivant RX. Applied Logistic Regression. 3rd ed. Wiley; 2013. §8.5 'Sample Size Issues'"
```

---

### D-19 生存资料 + 分组 → km_logrank

**改写结论:`supports`。** 出处列原为空白,现建两条 PMC 全文,覆盖「何时用 KM」「何时用 log-rank」
「两者共同的删失假定」「log-rank 何时失效(曲线交叉)」四点。第四点尤其重要 ——
它是 D-19 与 D-20 的分流依据。

**Primary(OA,PMC)**

> Clark TG, Bradburn MJ, Love SB, Altman DG. *Survival Analysis Part I: Basic concepts and first analyses.*
> **British Journal of Cancer.** 2003;89(2):232–238. doi:10.1038/sj.bjc.6601118
> https://pmc.ncbi.nlm.nih.gov/articles/PMC2394262/

- **Introduction, p.232(何时算生存资料)**:
  > "In many cancer studies, the main outcome under assessment is the time to an event of interest."
  > "it is usual that at the end of follow-up some of the individuals have not had the event of interest, and thus their true time to event is unknown."
- **KAPLAN–MEIER SURVIVAL ESTIMATE, p.234**:
  > "The survival probability can be estimated nonparametrically from observed survival times, both censored and uncensored, using the KM (or product-limit) method."
- **NONPARAMETRIC TESTS COMPARING SURVIVAL, p.236(分组比较 → log-rank)**:
  > "The logrank test is the most widely used method of comparing two or more survival curves."
  > "When only two groups are compared, the logrank test is testing the null hypothesis that the ratio of the hazard rates in the two groups is equal to 1."
- **SOME KEY REQUIREMENTS…, p.237(前置假定)**:
  > "Standard methods used to analyse survival data with censored observations are valid only if the censoring is 'noninformative'."

**Primary 补充(OA,PMC)——log-rank 的适用边界**

> Bland JM, Altman DG. *The logrank test.* **BMJ.** 2004;328(7447):1073. doi:10.1136/bmj.328.7447.1073
> https://pmc.ncbi.nlm.nih.gov/articles/PMC403858/

> "The logrank test is used to test the null hypothesis that there is no difference between the populations in the probability of an event (here a death) at any time point."
> "The logrank test is based on the same assumptions as the Kaplan Meier survival curve—namely, that censoring is unrelated to prognosis, the survival probabilities are the same for subjects recruited early and late in the study, and the events happened at the times specified."
> "The logrank test is most likely to detect a difference between groups when the risk of an event is consistently greater for one group than another. It is unlikely to detect a difference when survival curves cross, as can happen when comparing a medical with a surgical intervention."
> "When analysing survival data, the survival curves should always be plotted."

```yaml
D-19:
  citations:
    - id: clark2003-survival1
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2394262/"
      cite: "Clark TG, Bradburn MJ, Love SB, Altman DG. Survival Analysis Part I: Basic concepts and first analyses. Br J Cancer. 2003;89(2):232-238. doi:10.1038/sj.bjc.6601118"
      locator: "Introduction p.232;KAPLAN-MEIER SURVIVAL ESTIMATE p.234;NONPARAMETRIC TESTS COMPARING SURVIVAL p.236"
      quote: "The survival probability can be estimated nonparametrically from observed survival times, both censored and uncensored, using the KM (or product-limit) method. […] The logrank test is the most widely used method of comparing two or more survival curves."
    - id: bland2004-logrank
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC403858/"
      cite: "Bland JM, Altman DG. The logrank test. BMJ. 2004;328(7447):1073. doi:10.1136/bmj.328.7447.1073"
      locator: "Statistics Notes 全文(单页)"
      quote: "The logrank test is most likely to detect a difference between groups when the risk of an event is consistently greater for one group than another. It is unlikely to detect a difference when survival curves cross, as can happen when comparing a medical with a surgical intervention."
    - id: collett2015-ch2
      role: secondary
      access: print
      cite: "Collett D. Modelling Survival Data in Medical Research. 3rd ed. Chapman & Hall/CRC; 2015. Chapter 2 'Some non-parametric procedures', §2.1-2.6"
    - id: kleinbaum2012-ch2
      role: secondary
      access: print
      cite: "Kleinbaum DG, Klein M. Survival Analysis: A Self-Learning Text. 3rd ed. Springer; 2012. Chapter 2"
```

---

### D-20 生存资料 + 协变量 → cox_ph

**改写结论:`supports`。** 出处列原为空白。BJC 生存系列的 Part II 给「何时用 Cox」,
Part III 给 **PH 假定的检验方法与违反后的处置** —— 后者是这条卡片最该带上的东西,
因为「上了 Cox 却不查 PH」是审稿人最常打回的点。

**Primary(OA,PMC)——何时用 Cox**

> Bradburn MJ, Clark TG, Love SB, Altman DG. *Survival Analysis Part II: Multivariate data analysis – an introduction to concepts and methods.*
> **British Journal of Cancer.** 2003;89(3):431–436. doi:10.1038/sj.bjc.6601119
> https://pmc.ncbi.nlm.nih.gov/articles/PMC2394368/

- **THE NEED FOR MULTIVARIATE STATISTICAL MODELLING**:
  > "when investigating survival in relation to any one factor, it is often desirable to adjust for the impact of others"
- **THE COX ('SEMI-PARAMETRIC') PROPORTIONAL HAZARDS MODEL**:
  > "The Cox (proportional hazards or PH) model is the most commonly used multivariate approach for analysing survival time data in medical research."
  > "This assumption implies that the hazard curves for the groups should be proportional and cannot cross […] This proportionality assumption is often appropriate for survival time data but it is important to verify that it holds."

**Primary(OA,PMC)——PH 假定怎么查、违反了怎么办**

> Bradburn MJ, Clark TG, Love SB, Altman DG. *Survival Analysis Part III: Multivariate data analysis – choosing a model and assessing its adequacy and fit.*
> **British Journal of Cancer.** 2003;89(4):605–611. doi:10.1038/sj.bjc.6601120
> https://pmc.ncbi.nlm.nih.gov/articles/PMC2376927/

**ASSESSING WHETHER PH IS APPROPRIATE, p.609**:
> "The PH assumption, that is, the hazards are proportional (and not overlapping) at all points in time, should be verified."
> "If a PH model is valid, a plot of the logarithm of the cumulative hazard function in each group against the logarithm of time should give rise to lines that are parallel."
> "the (weighted) scaled Schoenfeld residuals test (Grambsch and Therneau, 1994), the linear correlation test (Harrell, 1986) and the time-dependent covariate test (Cox, 1972) were the most powerful diagnostic tools for proportionality."
> "the third tests whether the effect (coefficient) of a covariate changes with time (i.e. nonconstant hazard ratio). This latter method is appealing as it not only detects nonproportionality, but allows it to be modelled validly."
> "An alternative is to fit a stratified model, wherein a covariate that displays nonproportionality is modelled without the constraint of proportionality."

> 💡 **给卡片的落地建议**:D-20 输出里应固定附一项 PH 诊断(scaled Schoenfeld residuals 全局检验 +
> log–log 图),违反时的默认建议按上文给两条:①时依系数建模,②按该协变量分层。
> 这三句都能逐字引到 Part III p.609,不需要再找别的出处。

```yaml
D-20:
  citations:
    - id: bradburn2003-survival2
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2394368/"
      cite: "Bradburn MJ, Clark TG, Love SB, Altman DG. Survival Analysis Part II: Multivariate data analysis - an introduction to concepts and methods. Br J Cancer. 2003;89(3):431-436. doi:10.1038/sj.bjc.6601119"
      locator: "THE NEED FOR MULTIVARIATE STATISTICAL MODELLING;THE COX ('SEMI-PARAMETRIC') PROPORTIONAL HAZARDS MODEL"
      quote: "The Cox (proportional hazards or PH) model is the most commonly used multivariate approach for analysing survival time data in medical research. […] This proportionality assumption is often appropriate for survival time data but it is important to verify that it holds."
    - id: bradburn2003-survival3-ph
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2376927/"
      cite: "Bradburn MJ, Clark TG, Love SB, Altman DG. Survival Analysis Part III: Multivariate data analysis - choosing a model and assessing its adequacy and fit. Br J Cancer. 2003;89(4):605-611. doi:10.1038/sj.bjc.6601120"
      locator: "ASSESSING WHETHER PH IS APPROPRIATE, p.609"
      quote: "The PH assumption, that is, the hazards are proportional (and not overlapping) at all points in time, should be verified. […] the (weighted) scaled Schoenfeld residuals test (Grambsch and Therneau, 1994), the linear correlation test (Harrell, 1986) and the time-dependent covariate test (Cox, 1972) were the most powerful diagnostic tools for proportionality."
    - id: collett2015-ch3
      role: secondary
      access: print
      cite: "Collett D. Modelling Survival Data in Medical Research. 3rd ed. Chapman & Hall/CRC; 2015. Chapter 3 'The Cox regression model'"
    - id: therneau2000-ch6
      role: secondary
      access: print
      cite: "Therneau TM, Grambsch PM. Modeling Survival Data: Extending the Cox Model. Springer; 2000. Chapter 6 'Testing proportional hazards'"
```

---

### D-21 量表 ≥3 题 → cronbach_alpha

> ⚠️ **两个数字需要标注清楚:**
> 1. **「≥3 题」没有文献阈值。** 文献只支持「题数太少会出问题」(Tavakol & Dennick p.54:
>    题数太少会**违反 tau 等价假定并低估信度**),以及 EFA 侧「一个因子至少 3 个变量」
>    (Yong & Pearce p.80)。**3 应标为工程默认值,不要标为文献阈值。**
> 2. **「α≥0.70」这个阈值的真实出处是 Nunnally 1978 p.245,而且被普遍误引。**
>    Nunnally 的原话是在讨论**研究早期阶段**的经济性,不是通用合格线;Ellis 2013(OA)
>    逐字复核了这一点并论证该惯例**没有理据**。卡片里若要出现 0.70,必须同时带上这层限定。

**Primary(OA,PMC + 期刊官方免费页)——α 的定义、假定与报告口径**

> Tavakol M, Dennick R. *Making sense of Cronbach's alpha.* **International Journal of Medical Education.** 2011;2:53–55. doi:10.5116/ijme.4dfb.8dfd
> https://pmc.ncbi.nlm.nih.gov/articles/PMC4205511/ (官方 PDF: https://www.ijme.net/archive/2/cronbachs-alpha.pdf)

- **"What is Cronbach alpha?", p.53**:
  > "Alpha was developed by Lee Cronbach in 1951 to provide a measure of the internal consistency of a test or scale; it is expressed as a number between 0 and 1."
- **p.53(题数少 → α 低)**:
  > "If the test length is too short, the value of alpha is reduced."
- **"Use of Cronbach's alpha", p.54(核心假定 + 题数太少的后果 —— 支撑「≥N 题」这个门槛的最直接一句)**:
  > "More importantly, alpha is grounded in the 'tau equivalent model' which assumes that each test item measures the same latent trait on the same scale."
  > "If the number of test items is too small it will also violate the assumption of tau-equivalence and will underestimate reliability."
- **p.54(维度性)**:
  > "alpha should be calculated for each of the concepts rather than for the entire test or scale."
- **"Numerical values of alpha", p.54(阈值区间与上限)**:
  > "There are different reports about the acceptable values of alpha, ranging from 0.70 to 0.95."
  > "A maximum alpha value of 0.90 has been recommended."

**Primary(OA,PMC)——0.70 阈值的来源与其无理据性**

> Ellis JL. *A standard for test reliability in group research.* **Behavior Research Methods.** 2013;45(1):16–24. doi:10.3758/s13428-012-0223-z
> https://pmc.ncbi.nlm.nih.gov/articles/PMC3578733/

- **Abstract**:
  > "Many authors adhere to the rule that test reliabilities should be at least .70 or .80 in group research."
- **"Current reliability standards", pp.19–20**:
  > "Authors who wish to determine whether their computed reliability is sufficiently high often cite Nunnally (1978, p. 245; Nunnally & Bernstein, 1994), who stated that \"increasing reliabilities much beyond .80 is often wasteful of time and funds\" in basic research, because such an increase has little effect on correlations."
  > "Alphas larger than .70 are usually presented without comment and without further attempts to improve the scale."
  > "This observation does not justify the conventional standard of at least .70 or .80 for reliabilities in group research."
  > "a standard cannot be derived simply on the basis of common practice, because such reasoning is circular."

**Primary(OA,PMC)——现代批评:α 是下界,且不是内部结构的度量**

> Sijtsma K. *On the use, the misuse, and the very limited usefulness of Cronbach's alpha.* **Psychometrika.** 2009;74(1):107–120. doi:10.1007/s11336-008-9101-0
> https://pmc.ncbi.nlm.nih.gov/articles/PMC2792363/

> "This discussion paper argues that both the use of Cronbach's alpha as a reliability estimate and as a measure of internal consistency suffer from major problems."
> "Guttman (1945, p. 274) proved that alpha—his λ3 coefficient—is a lower bound to the reliability"(§3.3, pp.109–111)
> "There is no clear and unambiguous relationship between alpha and the internal structure of a test."(§4.2, p.115)

**Primary 补充(free_to_read,APA accepted 版 PDF)——α 的三条假定,可直接写进 Methods**

> McNeish D. *Thanks coefficient alpha, we'll take it from here.* **Psychological Methods.** 2018;23(3):412–433. doi:10.1037/met0000144
> https://rameliaz.github.io/files/kuliah/matrikulasi-mapsi/mcneish.pdf(课程站镜像;非出版社 OA)

**"Cronbach's Alpha" 一节, p.3**:
> "The assumptions of Cronbach's alpha are: 1. The scale adheres to tau equivalence. 2. Scale items are on a continuous scale and normally distributed. 3. The errors of the items do not covary."

**支撑「至少 3 题」的最近一条 OA 陈述**

> Yong AG, Pearce S. *A Beginner's Guide to Factor Analysis: Focusing on Exploratory Factor Analysis.* **Tutorials in Quantitative Methods for Psychology.** 2013;9(2):79–94.
> https://www.tqmp.org/RegularArticles/vol09-2/p079/p079.pdf

**"What are the Requirements for Factor Analysis?", p.80**:
> "For something to be labeled as a factor it should have at least 3 variables, although this depends on the design of the study (Tabachnick & Fidell, 2007). As a general guide, rotated factors that have 2 or fewer variables should be interpreted with caution. A factor with 2 variables is only considered reliable when the variables are highly correlated with each another (r > .70) but fairly uncorrelated with other variables."

```yaml
D-21:
  citations:
    - id: tavakol2011-alpha
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4205511/"
      cite: "Tavakol M, Dennick R. Making sense of Cronbach's alpha. Int J Med Educ. 2011;2:53-55. doi:10.5116/ijme.4dfb.8dfd"
      locator: "'Use of Cronbach's alpha' p.54;'Numerical values of alpha' p.54"
      quote: "More importantly, alpha is grounded in the 'tau equivalent model' which assumes that each test item measures the same latent trait on the same scale. […] If the number of test items is too small it will also violate the assumption of tau-equivalence and will underestimate reliability. […] There are different reports about the acceptable values of alpha, ranging from 0.70 to 0.95."
    - id: ellis2013-reliability-standard
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3578733/"
      cite: "Ellis JL. A standard for test reliability in group research. Behav Res Methods. 2013;45(1):16-24. doi:10.3758/s13428-012-0223-z"
      locator: "Abstract;'Current reliability standards' pp.19-20"
      quote: "Authors who wish to determine whether their computed reliability is sufficiently high often cite Nunnally (1978, p. 245; Nunnally & Bernstein, 1994), who stated that \"increasing reliabilities much beyond .80 is often wasteful of time and funds\" in basic research […] This observation does not justify the conventional standard of at least .70 or .80 for reliabilities in group research."
    - id: sijtsma2009-alpha
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2792363/"
      cite: "Sijtsma K. On the use, the misuse, and the very limited usefulness of Cronbach's alpha. Psychometrika. 2009;74(1):107-120. doi:10.1007/s11336-008-9101-0"
      locator: "Abstract;§3.3 pp.109-111;§4.2 p.115"
      quote: "Guttman (1945, p. 274) proved that alpha—his λ3 coefficient—is a lower bound to the reliability […] There is no clear and unambiguous relationship between alpha and the internal structure of a test."
    - id: mcneish2018-alpha-assumptions
      role: primary
      access: free_to_read
      url: "https://rameliaz.github.io/files/kuliah/matrikulasi-mapsi/mcneish.pdf"
      cite: "McNeish D. Thanks coefficient alpha, we'll take it from here. Psychological Methods. 2018;23(3):412-433. doi:10.1037/met0000144"
      locator: "'Cronbach's Alpha' 一节, p.3"
      quote: "The assumptions of Cronbach's alpha are: 1. The scale adheres to tau equivalence. 2. Scale items are on a continuous scale and normally distributed. 3. The errors of the items do not covary."
    - id: yong2013-3items
      role: primary
      access: oa
      url: "https://www.tqmp.org/RegularArticles/vol09-2/p079/p079.pdf"
      cite: "Yong AG, Pearce S. A Beginner's Guide to Factor Analysis: Focusing on Exploratory Factor Analysis. Tutorials Quant Methods Psychol. 2013;9(2):79-94. doi:10.20982/tqmp.09.2.p079"
      locator: "'What are the Requirements for Factor Analysis?' p.80"
      quote: "For something to be labeled as a factor it should have at least 3 variables, although this depends on the design of the study (Tabachnick & Fidell, 2007). As a general guide, rotated factors that have 2 or fewer variables should be interpreted with caution."
    - id: nunnally1978-p245
      role: secondary
      access: print
      cite: "Nunnally JC. Psychometric Theory. 2nd ed. McGraw-Hill; 1978, p. 245(α≥.70 的真实出处;原文限定于研究早期阶段)"
    - id: nunnally1994-ch7
      role: secondary
      access: print
      cite: "Nunnally JC, Bernstein IH. Psychometric Theory. 3rd ed. McGraw-Hill; 1994. Chapter 7 'The Assessment of Reliability', pp. 264-265"
    - id: streiner2015-ch5
      role: secondary
      access: print
      cite: "Streiner DL, Norman GR, Cairney J. Health Measurement Scales. 5th ed. OUP; 2015. Chapter 5 'Reliability'"
    - id: lance2006-cutoffs
      role: secondary
      access: paywalled
      cite: "Lance CE, Butts MM, Michels LC. The sources of four commonly reported cutoff criteria: What did they really say? Organizational Research Methods. 2006;9(2):202-220(经典证伪文献,未找到 OA 全文)"
```

---

### D-22 量表 + KMO ≥ 0.6 → efa

> ⚠️ **0.6 这个数字的真相**:它来自 Kaiser(1974)那套形容词分级里 **`.60s = "mediocre"`**
> 这一档 —— 即「勉强能用」的下沿,不是「推荐值」。现代最佳实践文献(Watkins 2018, p.226)
> 写的是 **`≥.70 desired`**,而 **`<.50 unacceptable`**。另有 OA 教程(Yong & Pearce, p.88)
> 直接用 `.50` 作截断。
> **建议**:卡片保留 0.60 作**硬闸**(低于即 blocked),同时在 0.60–0.70 区间输出一条
> 「sampling adequacy 仅为 mediocre,建议扩样本或删弥散题项」的软提示。这样两条数字都能引到原文。
>
> Kaiser 1974 原文在 Springer 付费墙后,但 **Watkins 2018 的作者自存档 PDF 里逐字转引了那段分级
> 并给了页码(p.35)** —— 这是目前唯一可自动核对的路径。

**Primary(作者自存档全文 PDF,可直接打开)**

> Watkins MW. *Exploratory Factor Analysis: A Guide to Best Practice.* **Journal of Black Psychology.** 2018;44(3):219–246. doi:10.1177/0095798418771807
> https://edpsychassociates.com/Papers/EFAguide(2018).pdf

- **"Appropriateness of the Data for EFA", pp.226–227(KMO 与 Bartlett —— D-22 的直接依据)**:
  > "An objective test of the factorability of the correlation matrix is Bartlett's (1954) test of sphericity, which statistically tests the hypothesis that the correlation matrix contains ones on the diagonal and zeros on the off-diagonals. Hence, that it was generated by random data. This test should produce a statistically significant chi-square value to justify the application of EFA."
  > "Large sample sizes make the Bartlett test sensitive to even trivial deviations from randomness, so its results should be supplemented with a measure of sampling adequacy. The Kaiser-Meyer-Olkin (KMO; Kaiser, 1974) measure of sampling adequacy is the ratio of correlations and partial correlations that reflects the extent to which correlations are a function of the variance shared across all variables rather than the variance shared by particular pairs of variables."
  > "Overall KMO values ≥.70 are desired (Hoelzle & Meyer, 2013; Lloret et al., 2017), but values less than .50 are generally considered unacceptable (Child, 2006; Hair et al., 2010; Kaiser, 1974), indicating that the correlation matrix is not factorable."
  > "As colorfully described by Kaiser (1974), KMO values \"in the .90s, marvelous; in the 80s, meritorious; in the .70s, middling; in the .60s, mediocre; in the .50s, miserable; below .50, unacceptable\" (p. 35)."
- **"Model of Factor Analysis", p.228(EFA 而不是 PCA)**:
  > "most methodologists recommend that common factor analysis be employed when the purpose is to identify latent constructs responsible for the variation of measured variables"
- **"Estimation Method", p.229(抽取方法默认值)**:
  > "Simulation results led Briggs and MacCallum (2003) to recommend use of PA \"in exploratory factor analysis in practice to increase the likelihood that all major common factors are recovered\" (p. 54)."
- **"The Number of Factors to Retain", p.230(因子数判据 —— 别用特征值>1)**:
  > "the default method used by many statistical software programs (e.g., the \"eigenvalue 1\" rule) is usually wrong and should not be used (Fabrigar & Wegener, 2012; Izquierdo et al., 2014; Norris & Lecavalier, 2010)."
  > "Measurement specialists have conducted simulation studies and concluded that parallel analysis and MAP are the most accurate empirical estimates of the number of factors to retain and that scree is a useful subjective adjunct to the empirical estimates"
- **"Rotation of Factors", p.233(旋转默认值 —— 斜交)**:
  > "To honor the reality that almost everything measured in the social sciences is correlated to some degree (Meehl, 1990), measurement specialists typically recommend that an oblique rotation be applied to allow factor intercorrelations to emerge"

**Primary 补充(OA,期刊官方 PDF)**

> Yong AG, Pearce S. *A Beginner's Guide to Factor Analysis: Focusing on Exploratory Factor Analysis.* **Tutorials in Quantitative Methods for Psychology.** 2013;9(2):79–94.
> https://www.tqmp.org/RegularArticles/vol09-2/p079/p079.pdf

- **"Preliminary Interpretation", p.88**:
  > "Second, we will look at the Bartlett's Test of Sphericity (see Figure 7; significant level of p < .05) to confirm that our example has patterned relationships. […] Finally, we will determine if our example is suitable for EFA by looking at the Kaiser-Meyer-Olkin Measure (KMO) of Sampling Adequacy (see Figure 7; cut-off above .50) and the diagonal element of the Anti-Correlation matrix that has the 'a' superscript (see Figure 8; cut-off of above .50). If this requirement is not met, this means that distinct and reliable factors cannot be produced."
- **"What are the Requirements for Factor Analysis?", p.80(样本量)**:
  > "The recommended sample size is at least 300 participants, and the variables that are subjected to factor analysis each should have at least 5 to 10 observations (Comrey & Lee, 1992)."

```yaml
D-22:
  citations:
    - id: watkins2018-kmo
      role: primary
      access: free_to_read
      url: "https://edpsychassociates.com/Papers/EFAguide(2018).pdf"
      cite: "Watkins MW. Exploratory Factor Analysis: A Guide to Best Practice. Journal of Black Psychology. 2018;44(3):219-246. doi:10.1177/0095798418771807"
      locator: "'Appropriateness of the Data for EFA' pp.226-227"
      quote: "Overall KMO values ≥.70 are desired (Hoelzle & Meyer, 2013; Lloret et al., 2017), but values less than .50 are generally considered unacceptable (Child, 2006; Hair et al., 2010; Kaiser, 1974), indicating that the correlation matrix is not factorable. As colorfully described by Kaiser (1974), KMO values \"in the .90s, marvelous; in the 80s, meritorious; in the .70s, middling; in the .60s, mediocre; in the .50s, miserable; below .50, unacceptable\" (p. 35)."
    - id: watkins2018-efa-defaults
      role: primary
      access: free_to_read
      url: "https://edpsychassociates.com/Papers/EFAguide(2018).pdf"
      cite: "Watkins MW. J Black Psychol. 2018;44(3):219-246."
      locator: "'Model of Factor Analysis' p.228;'The Number of Factors to Retain' p.230;'Rotation of Factors' p.233"
      quote: "the default method used by many statistical software programs (e.g., the \"eigenvalue 1\" rule) is usually wrong and should not be used […] measurement specialists typically recommend that an oblique rotation be applied to allow factor intercorrelations to emerge"
    - id: yong2013-kmo-bartlett
      role: primary
      access: oa
      url: "https://www.tqmp.org/RegularArticles/vol09-2/p079/p079.pdf"
      cite: "Yong AG, Pearce S. A Beginner's Guide to Factor Analysis: Focusing on Exploratory Factor Analysis. Tutorials Quant Methods Psychol. 2013;9(2):79-94. doi:10.20982/tqmp.09.2.p079"
      locator: "'Preliminary Interpretation' p.88;'What are the Requirements for Factor Analysis?' p.80"
      quote: "Finally, we will determine if our example is suitable for EFA by looking at the Kaiser-Meyer-Olkin Measure (KMO) of Sampling Adequacy (see Figure 7; cut-off above .50) and the diagonal element of the Anti-Correlation matrix that has the 'a' superscript (see Figure 8; cut-off of above .50). If this requirement is not met, this means that distinct and reliable factors cannot be produced."
    - id: kaiser1974-index
      role: secondary
      access: paywalled
      cite: "Kaiser HF. An index of factorial simplicity. Psychometrika. 1974;39(1):31-36, p.35(KMO 分级原始出处;经 Watkins 2018 p.227 逐字转引可核对)"
    - id: field2018-spss5
      role: secondary
      access: print
      cite: "Field A. Discovering Statistics Using IBM SPSS Statistics. 5th ed. Sage; 2018. §18.5.2 'Sample size and factorability'"
    - id: fabrigar2012-efa
      role: secondary
      access: print
      cite: "Fabrigar LR, Wegener DT. Exploratory Factor Analysis. OUP; 2012. Chapters 3-5"
```

---

## 本批小结:三条规则的阈值需要动

| 规则 | 现写法 | 文献实况 | 建议 |
|---|---|---|---|
| **D-17** | EPV<5 → blocked,fallback `fisher` | 无任何文献支持硬阈值;「严重问题主要在 EPV 2–4」;正确对策是 **Firth 惩罚似然** | 阈值保留但改成 warn+建议;**fallback 改 `firth_logistic`** |
| **D-21** | 量表 ≥3 题 | 无「3」的文献依据;只有「题数太少违反 tau 等价并低估信度」 | 3 标为工程默认;α≥0.70 引用时必须带 Nunnally 的「早期研究」限定 |
| **D-22** | KMO≥0.6 | 0.6 = Kaiser 分级的 `mediocre` 下沿;现代最佳实践是 `≥.70 desired`、`<.50 unacceptable` | 0.60 作硬闸 + 0.60–0.70 出 mediocre 软提示 |

其余三条(D-16 / D-19 / D-20)出处链完整,全部 PMC 开放全文,`supports`。
D-20 建议顺带把「PH 假定诊断」固化进输出 —— 三种诊断方法与两种违反后处置都能逐字引到 BJC Part III p.609。

---

## 四 · D-09 ~ D-12 事后多重比较族

## 事后多重比较族（D-09 ~ D-12）出处 OA 化改写

**改写口径**：四条规则的原 primary（Duncan 1955 / Tukey 1953 未刊手稿 / Games & Howell 1976 / Dunn 1964）全部换成**可被 AI 评审 agent 实际打开并逐字核对**的开放获取文献；原教科书与原始方法论文降为 `secondary`（仍写进 Methods 的引用列表，审稿人认这个权威）。

本批共取到 8 份可打开全文（全部实测 WebFetch/PDF 已读）：

| 短 id | 出处 | 许可/可及性 | 覆盖规则 |
|---|---|---|---|
| `agbangba2024` | Heliyon 10(3):e25131（PMC11637079） | CC BY-NC-ND 4.0 | D-09 / D-10 / D-11 / D-12 |
| `midway2020` | PeerJ 8:e10387（PMC7720730） | CC BY 4.0 | D-09 / D-10 / D-12 |
| `lee2018` | Korean J Anesthesiol 71(5):353–360（PMC6193594） | CC BY-NC | D-09 / D-10 / D-11 / D-12 |
| `kim2015` | Restor Dent Endod 40(2):172–176 | CC BY-NC 3.0 | D-09 / D-10 |
| `juarros2024` | Methodology 20(2):84–99（PsychOpen GOLD） | CC BY 4.0 | D-10 / D-11 |
| `dinno2015` | Stata J 15(1):292–300（作者自存档） | 作者自存档全文 | D-12 |
| `conover1979` | LANL LA-7677-MS（OSTI） | 美国政府报告，公开 | D-12 |
| `asastyle` | ASA–CSSA–SSSA Style Manual Ch.5 | 学会免费 PDF | D-10（字母标注惯例） |

---

### D-09 事后 · 走 D-06 · 学科 ∈ {农学, 食品} → allowed[duncan, tukey, lsd, snk], default = duncan

**现引问题**：Duncan (1955) *Biometrics* 付费老论文；「学科惯例」是硬编码断言，无出处。

**新 primary（惯例侧）**：Agbangba et al. 2024, *Heliyon* —— 二十年文献计量，给出**逐学科**事后检验使用占比，这是「农学/食品默认 Duncan」目前唯一可被机器核对的实证依据。

> "Tukey HSD (30.04%), Duncan (25.41%), and Fisher's LSD (18.15%) were the most used post-hoc tests over the past twenty years. In contrast, the Games-Howell test (1.13%), Holm-Bonferroni (1.25%), and Scheffe's test (2.25%) were the least used. In most domains, Tukey HSD was the most commonly used post-hoc test. Apart from Tukey HSD, Duncan's test (20%) and Fisher's LSD (20%) were the most commonly used in genetics. **In agriculture, Duncan's test (32.68%) and Fisher's LSD (28.74%) were mostly used.** In biotechnology, Duncan's test (40%) was the most used. In breeding and animal health, Duncan's test (33.33%) was the most highly cited test in the literature."
> —— §2.3.1 *Current use of post-hoc tests according to the domain*（配 Table 1）

食品侧另有一句直接对应：

> "In nutrition and food security, Duncan's (46.08%) and Tukey HSD (28.70%) were used."
> —— 同节

**新 primary（caveat 侧，会逐字进用户 Methods）**：三份 OA 独立指认 Duncan 不控 FWER，任选其一或并列。

> "Despite its high power, this test provides an increasing type I error rate (even when assumptions hold) for more than three comparisons [17] and is affected by unequal group size [36]."
> —— Agbangba et al. 2024, §2.2 *Duncan's test*

> "In this paper, we do not discuss Fisher's LSD, Duncan's multiple range test, and Student-Newman-Keuls' procedure. **Since these methods do not control FWER**, they do not suit the purpose of this paper."
> —— Lee & Lee 2018, p. 357 脚注 6

> "We have excluded recommending Fisher's LSD, Duncan's MRT, or SNK for unplanned comparisons as they are known for not adjusting the EER enough."
> —— Midway et al. 2020, Discussion → *Unplanned comparisons*（Conclusions → Recommendations 第 3 条更硬：**"Avoid Fisher's LSD, Duncan's MRT, and the SNK tests."**）

> "It shows more liberal tendency than the SNK procedure. Generally Duncan's multiple range test is not recommended when sample sizes are unequal because of the liberal tendency."
> —— Kim 2015, §2.2.2, p. 175

🔴 **口径提醒**：Heliyon 支撑的是「Duncan 在农学/食品**用得最多**」这一描述性事实，**不是**「期刊要求用 Duncan」。卡片文案与 Methods 模板都必须写成「学科惯例（使用频次实证）」，写成「学科要求」会构成无出处断言 —— 见 unresolved 第 1 条。

```yaml
D-09:
  citations:
    - id: agbangba2024-domain
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/"
      cite: "Agbangba, C. E., Sacla Aide, E., Honfo, H., & Glèlè Kakaï, R. (2024). On the use of post-hoc tests in environmental and biological sciences: A critical review. Heliyon, 10(3), e25131. https://doi.org/10.1016/j.heliyon.2024.e25131"
      locator: "§2.3.1 Current use of post-hoc tests according to the domain; Table 1"
      quote: "Tukey HSD (30.04%), Duncan (25.41%), and Fisher's LSD (18.15%) were the most used post-hoc tests over the past twenty years. In contrast, the Games-Howell test (1.13%), Holm-Bonferroni (1.25%), and Scheffe's test (2.25%) were the least used. In most domains, Tukey HSD was the most commonly used post-hoc test. Apart from Tukey HSD, Duncan's test (20%) and Fisher's LSD (20%) were the most commonly used in genetics. In agriculture, Duncan's test (32.68%) and Fisher's LSD (28.74%) were mostly used. In biotechnology, Duncan's test (40%) was the most used. In breeding and animal health, Duncan's test (33.33%) was the most highly cited test in the literature."
    - id: agbangba2024-food
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/"
      cite: "Agbangba et al. (2024). Heliyon, 10(3), e25131."
      locator: "§2.3.1"
      quote: "In nutrition and food security, Duncan's (46.08%) and Tukey HSD (28.70%) were used."
    - id: agbangba2024-duncan-t1e
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/"
      cite: "Agbangba et al. (2024). Heliyon, 10(3), e25131."
      locator: "§2.2 Duncan's test"
      quote: "Despite its high power, this test provides an increasing type I error rate (even when assumptions hold) for more than three comparisons [17] and is affected by unequal group size [36]."
    - id: lee2018-fn6
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/"
      cite: "Lee, S., & Lee, D. K. (2018). What is the proper way to apply the multiple comparison test? Korean Journal of Anesthesiology, 71(5), 353-360. https://doi.org/10.4097/kja.d.18.00242"
      locator: "p. 357, footnote 6"
      quote: "In this paper, we do not discuss Fisher's LSD, Duncan's multiple range test, and Student-Newman-Keuls' procedure. Since these methods do not control FWER, they do not suit the purpose of this paper."
    - id: midway2020-avoid
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7720730/"
      cite: "Midway, S., Robertson, M., Flinn, S., & Kaller, M. (2020). Comparing multiple comparisons: practical guidance for choosing the best multiple comparisons test. PeerJ, 8, e10387. https://doi.org/10.7717/peerj.10387"
      locator: "Discussion > Unplanned comparisons; Conclusions > Recommendations #3"
      quote: "We have excluded recommending Fisher's LSD, Duncan's MRT, or SNK for unplanned comparisons as they are known for not adjusting the EER enough."
    - id: kim2015-duncan
      role: primary
      access: oa
      url: "https://pdfs.semanticscholar.org/ea42/8285e1132ca35938e2abdb5fa0c0925ac0b8.pdf"
      cite: "Kim, H.-Y. (2015). Statistical notes for clinical researchers: post-hoc multiple comparisons. Restorative Dentistry & Endodontics, 40(2), 172-176. https://doi.org/10.5395/rde.2015.40.2.172"
      locator: "§2.2.2 Duncan's multiple range test, p. 175; Table 2, p. 173"
      quote: "It shows more liberal tendency than the SNK procedure. Generally Duncan's multiple range test is not recommended when sample sizes are unequal because of the liberal tendency."
    - id: gomez1984
      role: secondary
      access: print
      cite: "Gomez, K. A., & Gomez, A. A. (1984). Statistical Procedures for Agricultural Research (2nd ed.). Wiley. Ch. 5 'Comparison Between Treatment Means' (Duncan's Multiple Range Test)"
    - id: steel1997
      role: secondary
      access: print
      cite: "Steel, R. G. D., Torrie, J. H., & Dickey, D. A. (1997). Principles and Procedures of Statistics: A Biometrical Approach (3rd ed.). McGraw-Hill. Ch. 8 'Multiple Comparisons'"
    - id: duncan1955
      role: secondary
      access: paywalled
      cite: "Duncan, D. B. (1955). Multiple range and multiple F tests. Biometrics, 11(1), 1-42.（方法原始文献，降为 secondary）"
```

---

### D-10 事后 · 走 D-06 · 学科 ∉ {农学, 食品} → allowed[tukey, dunnett, bonferroni_t], default = tukey

**现引问题**：Tukey (1953) *The Problem of Multiple Comparisons* —— **从未正式出版**，只是普林斯顿的油印手稿，机器无法取全文，人也引不到。

先把这件事本身钉死（这条本身就是 OA 可核的）：

> "Tukey, J. W. (1953). *The problem of multiple comparisons*, Unpublished manuscript, Princeton University."
> —— Juarros-Basterretxea et al. 2024, References, p. 99

**新 primary**：Midway et al. 2020, *PeerJ*（CC BY 4.0）—— 现代、被广泛引用、且**直接论证「什么时候该用 Tukey」**而非提出方法，正好符合选源原则第 4 条。

> "Perhaps most commonly used is Tukey HSD (honest significant difference) test widely applied for parametric unplanned comparisons. Our simulations found Tukey's HSD test to be less conservative than the Dunn-Šidák test, and with lower type II error rates than Bonferroni. **Overall, the Tukey HSD test is a robust, commonly available, and generally recommended test.**"
> —— Discussion → *Unplanned comparisons*

**并列 primary（规范表述，最适合直接进 Methods）**：

> "Tukey's HSD procedure provides the simplest way to control αFW and is considered as the most preferable method when all pairwise comparisons are performed. The studentized range statistic (q statistic) is used to determine the critical values based on number of groups and number of observations in a group. As Tukey's HSD procedure assumes equal size of all compared groups, a modified Tukey-Kramer method can be applied for comparisons of unequal-sized groups."
> —— Kim 2015, §2.1.1, p. 175（该文 p. 176 "Summary" 第 1 条：**"For usual post-hoc pairwise comparisons, Tukey's HSD procedure or REGWQ may be preferable."**）

**allowed 集里 dunnett 的出处**：

> "This is a particularly useful method to analyze studies having control groups, based on modified t-test statistics (Dunnett's t-distribution). It is a powerful statistic and, therefore, can discover relatively small but significant differences among groups or combinations of groups."
> —— Lee & Lee 2018, *Dunnett method*, p. 357

**不等样本量的口径（Tukey → Tukey–Kramer）**：

> "It is noted that the Tukey test is based on the same sample counts between groups (balanced data) as ANOVA. Subsequently, Kramer modified this method to apply it on unbalanced data, and it became known as the Tukey-Kramer test."
> —— Lee & Lee 2018, *Tukey method*, p. 355

**字母标注（compact letter display）的排版惯例**，若卡片输出三线表带 a/b/c：

> "Mean comparisons: When letters are used to display the significance of pairwise mean comparisons in tables or figures, the meaning of letters should be concisely described in captions. Two examples of suitable verbiage: \"Means not sharing a letter are significantly different at the 5% level of significance according to a t-test\" or \"Means with a letter in common are not significantly different at the 5% level according to Tukey's HSD test.\""
> —— ASA–CSSA–SSSA *Publications Handbook and Style Manual*, Ch. 5 *Tables*, pp. 5-3/5-4

⚠️ 反向证据必须同时挂上（诚实性要求）：Juarros-Basterretxea et al. 2024 的模拟里，同方差平衡条件下 **Tukey HSD 系统性偏自由**（Table 1，N=30 时 αrate=5.78），作者结论是 Bonferroni/Šidák/Hochberg GT2/Gabriel 更准。这不推翻 default=tukey（Tukey 在功效与可得性上仍最优、且是审稿惯例），但卡片 caveat 应写明「Tukey HSD 在小样本下 α 略高于名义值」。

```yaml
D-10:
  citations:
    - id: midway2020-tukey
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7720730/"
      cite: "Midway, S., Robertson, M., Flinn, S., & Kaller, M. (2020). Comparing multiple comparisons: practical guidance for choosing the best multiple comparisons test. PeerJ, 8, e10387. https://doi.org/10.7717/peerj.10387"
      locator: "Discussion > Unplanned comparisons"
      quote: "Perhaps most commonly used is Tukey HSD (honest significant difference) test widely applied for parametric unplanned comparisons. Our simulations found Tukey's HSD test to be less conservative than the Dunn-Sidak test, and with lower type II error rates than Bonferroni. Overall, the Tukey HSD test is a robust, commonly available, and generally recommended test."
    - id: kim2015-tukey
      role: primary
      access: oa
      url: "https://pdfs.semanticscholar.org/ea42/8285e1132ca35938e2abdb5fa0c0925ac0b8.pdf"
      cite: "Kim, H.-Y. (2015). Statistical notes for clinical researchers: post-hoc multiple comparisons. Restorative Dentistry & Endodontics, 40(2), 172-176. https://doi.org/10.5395/rde.2015.40.2.172"
      locator: "§2.1.1 Tukey's HSD procedure, p. 175; Summary item 1, p. 176"
      quote: "Tukey's HSD procedure provides the simplest way to control alphaFW and is considered as the most preferable method when all pairwise comparisons are performed. The studentized range statistic (q statistic) is used to determine the critical values based on number of groups and number of observations in a group. As Tukey's HSD procedure assumes equal size of all compared groups, a modified Tukey-Kramer method can be applied for comparisons of unequal-sized groups."
    - id: lee2018-tukey-dunnett
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/"
      cite: "Lee, S., & Lee, D. K. (2018). Korean Journal of Anesthesiology, 71(5), 353-360."
      locator: "Tukey method p. 355; Dunnett method p. 357"
      quote: "It is noted that the Tukey test is based on the same sample counts between groups (balanced data) as ANOVA. Subsequently, Kramer modified this method to apply it on unbalanced data, and it became known as the Tukey-Kramer test."
    - id: juarros2024-tukey1953
      role: primary
      access: oa
      url: "https://meth.psychopen.eu/index.php/meth/article/download/11721/11721.pdf/"
      cite: "Juarros-Basterretxea, J., Aonso-Diego, G., Postigo, A., Montes-Alvarez, P., Menendez-Aller, A., & Garcia-Cueto, E. (2024). Post-hoc tests in one-way ANOVA: The case for normal distribution. Methodology, 20(2), 84-99. https://doi.org/10.5964/meth.11721"
      locator: "References, p. 99（证明 Tukey 1953 为未刊手稿）; Table 1, p. 89（Tukey HSD 偏自由的反向证据）"
      quote: "Tukey, J. W. (1953). The problem of multiple comparisons, Unpublished manuscript, Princeton University."
    - id: asastyle-cld
      role: primary
      access: free_to_read
      url: "https://www.agronomy.org/files/publications/style/chapter-05.pdf"
      cite: "ASA-CSSA-SSSA. Publications Handbook and Style Manual, Chapter 5 'Tables'."
      locator: "pp. 5-3 to 5-4, 'Mean comparisons' paragraph"
      quote: "Mean comparisons: When letters are used to display the significance of pairwise mean comparisons in tables or figures, the meaning of letters should be concisely described in captions. Two examples of suitable verbiage: \"Means not sharing a letter are significantly different at the 5% level of significance according to a t-test\" or \"Means with a letter in common are not significantly different at the 5% level according to Tukey's HSD test.\""
    - id: montgomery2019
      role: secondary
      access: print
      cite: "Montgomery, D. C. (2019). Design and Analysis of Experiments (10th ed.). Wiley. Ch. 3 §3.5 'Comparison Among Treatment Means'（§3.5.7 Tukey's Test）"
    - id: zar2010
      role: secondary
      access: print
      cite: "Zar, J. H. (2010). Biostatistical Analysis (5th ed.). Pearson. Ch. 11 'Multiple Comparisons'"
    - id: tukey1953
      role: secondary
      access: unpublished
      cite: "Tukey, J. W. (1953). The Problem of Multiple Comparisons. Unpublished manuscript, Princeton University.（原始手稿，从未正式出版，仅作历史署名，不作可核出处）"
```

---

### D-11 事后 · 走 D-07（方差不齐）→ allowed[games_howell, dunnett_t3, tamhane_t2], default = games_howell

**现引问题**：Games & Howell 1976 *J. Educ. Stat.* 付费。

**新 primary（allowed 集三件套一次到位，措辞几乎可直接抄进 Methods）**：

> "All the aforementioned methods can be used only in the situation of equal variance assumption. If equal variance assumption is violent during the ANOVA process, pairwise comparisons should be based on the statistics of **Tamhane's T2, Dunnett's T3, Games-Howell, and Dunnett's C** tests."
> —— Lee & Lee 2018, p. 355（"violent" 为原刊拼写，逐字保留）

**新 primary（Games-Howell 为何是 default）**：

> "The Games-Howell method is an improved version of the Tukey-Kramer method and is applicable in cases where the equivalence of variance assumption is violated. It is a t-test using Welch's degree of freedom. This method uses a strategy for controlling the type I error for the entire comparison and is known to maintain the preset significance level even when the size of the sample is different. However, the smaller the number of samples in each group, the it is more tolerant the type I error control. Thus, this method can be applied when the number of samples is six or more."
> —— Lee & Lee 2018, *Violation of the assumption of equivalence of variance*, p. 358

> "For parametric post-hoc tests, there are tests available for both equality and inequality of variance, such as Fisher's LSD, Scheffé, Tukey, Duncan, and Student-Newman-Keuls (SNK) for equal variances and **Games-Howell, T'method, and Krammer's for unequal variances**."
> —— Agbangba et al. 2024, §3.2 *Holding of post-hoc test assumptions*

🔴 **必须并列的反向证据（这条是本批最重要的诚实性缺口）**：最新一份专门做该情形的蒙特卡洛模拟（28 数据集 × 10,000 重抽样）发现 Games-Howell 在方差不齐条件下**是三者中最自由的那个**，Tamhane T2 / Dunnett T3 的 α 更准：

> "All tests assuming equal variances were excessively liberal for this condition, whereas tests that assume unequal variances performed systematically better when groups were heteroscedastic and balanced (see Table 2). Particularly, Tamhane's T2 (αrate = 5.04–5.23) and Dunnett's T3 (αrate = 5.10–5.24) were the most accurate tests for N = 150, N = 750, and N = 3,000."
> —— Juarros-Basterretxea et al. 2024, *Condition 2*, p. 90

> "In general, Dunnett's T3 was more liberal and its performance worse than Tamhane's T2. On the contrary, accordingly to Tamhane (1979), **Games-Howell's test was the most liberal of these three post-hoc tests**."
> —— 同上, Discussion, p. 93

> "Games-Howell's test was systematically liberal in this condition, although it is theoretically appropriate for an unbalanced group comparison under heteroscedasticity."
> —— 同上, p. 95（第四条件：方差不齐 + 不平衡）

**卡片 caveat 建议正文**：default 保持 `games_howell`（可得性最好、功效最高、SPSS/R/Python 均实现），但当**每组 n < 6** 或 **总样本小**时提示切 `tamhane_t2`；Lee & Lee 另给出 n<50 时 Dunnett T3 更合适的口径。

```yaml
D-11:
  citations:
    - id: lee2018-unequalvar-set
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/"
      cite: "Lee, S., & Lee, D. K. (2018). What is the proper way to apply the multiple comparison test? Korean Journal of Anesthesiology, 71(5), 353-360. https://doi.org/10.4097/kja.d.18.00242"
      locator: "Classification (or Type) of Multiple Comparison, p. 355"
      quote: "All the aforementioned methods can be used only in the situation of equal variance assumption. If equal variance assumption is violent during the ANOVA process, pairwise comparisons should be based on the statistics of Tamhane's T2, Dunnett's T3, Games-Howell, and Dunnett's C tests."
    - id: lee2018-gameshowell
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/"
      cite: "Lee, S., & Lee, D. K. (2018). Korean Journal of Anesthesiology, 71(5), 353-360."
      locator: "Violation of the assumption of equivalence of variance, p. 358"
      quote: "The Games-Howell method is an improved version of the Tukey-Kramer method and is applicable in cases where the equivalence of variance assumption is violated. It is a t-test using Welch's degree of freedom. This method uses a strategy for controlling the type I error for the entire comparison and is known to maintain the preset significance level even when the size of the sample is different. However, the smaller the number of samples in each group, the it is more tolerant the type I error control. Thus, this method can be applied when the number of samples is six or more."
    - id: agbangba2024-unequalvar
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/"
      cite: "Agbangba, C. E., Sacla Aide, E., Honfo, H., & Glele Kakai, R. (2024). Heliyon, 10(3), e25131."
      locator: "§3.2 Holding of post-hoc test assumptions"
      quote: "For parametric post-hoc tests, there are tests available for both equality and inequality of variance, such as Fisher's LSD, Scheffe, Tukey, Duncan, and Student-Newman-Keuls (SNK) for equal variances and Games-Howell, T'method, and Krammer's for unequal variances."
    - id: juarros2024-caveat
      role: primary
      access: oa
      url: "https://meth.psychopen.eu/index.php/meth/article/download/11721/11721.pdf/"
      cite: "Juarros-Basterretxea, J., et al. (2024). Post-hoc tests in one-way ANOVA: The case for normal distribution. Methodology, 20(2), 84-99. https://doi.org/10.5964/meth.11721"
      locator: "Results, Condition 2, p. 90 & Table 2; Discussion, p. 93 and p. 95"
      quote: "In general, Dunnett's T3 was more liberal and its performance worse than Tamhane's T2. On the contrary, accordingly to Tamhane (1979), Games-Howell's test was the most liberal of these three post-hoc tests."
    - id: howell2013
      role: secondary
      access: print
      cite: "Howell, D. C. (2013). Statistical Methods for Psychology (8th ed.). Wadsworth Cengage. Ch. 12 'Multiple Comparisons Among Treatment Means'"
    - id: field2018
      role: secondary
      access: print
      cite: "Field, A. (2018). Discovering Statistics Using IBM SPSS Statistics (5th ed.). SAGE. Ch. 12 'GLM 1: Comparing several independent means'"
    - id: games1976
      role: secondary
      access: paywalled
      cite: "Games, P. A., & Howell, J. F. (1976). Pairwise multiple comparison procedures with unequal N's and/or variances: A Monte Carlo study. Journal of Educational Statistics, 1(2), 113-125.（方法原始文献，降为 secondary）"
```

---

### D-12 事后 · 走 D-08（非参）→ allowed[dunn, conover, dscf], default = dunn（p 值按 BH 校正）

**现引问题**：Dunn 1964 *Technometrics* 付费。

**新 primary**：Dinno 2015（*Stata Journal* 15(1):292–300）作者自存档全文。这条的措辞就是「什么时候该用它」，正是卡片要的：

> "Dunn's insight (1964) was to retain the rank sums from the omnibus test, and to construct a z test statistic approximation to the exact rank sum statistic: **Dunn's test is the appropriate procedure following a Kruskal-Wallis test.**"
> —— §1 *Introduction*, 自存档稿 p. 2

同一稿摘要（p. 1）：

> "Dunn's test is the appropriate nonparametric pairwise multiple comparison procedure following rejection of a Kruskal-Wallis test, and is now implemented for Stata in the `dunn` package."

⚠️ **必须标注**：该 PDF 顶部有作者自加的横幅 —— "This pre-submission manuscript does not include edits based on reviewer input, and contains a few errors (mostly in documentation)."。正式版摘要（PDXScholar 机构库著录）措辞为 "Dunn's test is the appropriate nonparametric pairwise multiple-comparison procedure when a Kruskal–Wallis test is rejected, and it is now implemented for Stata in the `dunntest` package."。**引用时用正式版书目 + 自存档 URL**，不要把 preprint 的 `dunn` 包名当正式版。

**BH 校正的出处**（两条 OA，任选）：

> "`bh` specifies a Benjamini-Hochberg adjustment where the false discovery rate (FDR) is adjusted sequentially by adjusting the p-values of each pairwise test as ordered from largest to smallest with p[m/(m+1-i)], where i is the position in the ordering as per Benjamini and Hochberg (1995). Stata will report a maximum Benjamini-Hochberg-adjusted p-value of 1. Such FDR-adjusted p-values are sometimes referred to as q-values in the literature."
> —— Dinno 2015, §2.3 *Options*（公式见 §5.2 式 (7)）

> "An alternative to controlling the FWER is to control the FDR using the Benjamini-Hochberg and Benjamini & Yekutieli adjustments. The FDR controls the expected rate of the null hypothesis that is incorrectly rejected (type I error) in the rejected hypothesis list. It is less conservative. By performing the comparison procedure with a greater power compared to FWER control, the probability that a type I error will occur can be increased."
> —— Lee & Lee 2018, p. 359

**allowed 集里 conover 的出处**（美国能源部公开报告，永久可取）：

> "Some of the more popular multiple-comparisons procedures are discussed and compared. Some new nonparametric methods are introduced. One procedure is an analog to the Fisher's least significant difference method for the completely randomized design. Some simulation studies indicate this procedure is a reasonable nonparametric method to use."
> —— Conover & Iman 1979, LA-7677-MS, Abstract, p. 1

> "The first stage is an overall test of the hypothesis \"no treatment differences\" at an acceptable α level, say α = 0.05. If the hypothesis is accepted, no further comparisons are made. In this way an overall experimentwise α level is maintained at or below the specified level."
> —— 同上, §I *Introduction*, p. 2

**allowed 集里 dscf 的出处**（仅列举级，见 unresolved 第 6 条）：

> "Non-parametric post-hoc tests include the Dunn, Steel, Nemenyi, and Steel-Dwass tests."
> —— Agbangba et al. 2024, §3.2

🔴 **命名陷阱（务必写进卡片实现注释）**：`Dunn 1961` 与 `Dunn 1964` 是**两个不同的东西**，OA 文献里都叫 "Dunn's method"：
- **Dunn (1961)** *JASA* 56:52–64 = **Bonferroni–Dunn，α 分割**，Lee & Lee 2018 的 "Bonferroni method: α splitting (Dunn's method)" 一节讲的是这个；
- **Dunn (1964)** *Technometrics* 6:241–252 = **秩和多重比较**，才是 D-12 的 `dunn`。

引用时如果抓了 Lee & Lee 那一节当 D-12 的 primary，就引错了对象。

```yaml
D-12:
  citations:
    - id: dinno2015-appropriate
      role: primary
      access: free_to_read
      url: "https://alexisdinno.com/files/Dinno2014b.pdf"
      cite: "Dinno, A. (2015). Nonparametric pairwise multiple comparisons in independent groups using Dunn's test. The Stata Journal, 15(1), 292-300. https://doi.org/10.1177/1536867X1501500117 （作者自存档全文；机构库著录 https://pdxscholar.library.pdx.edu/commhealth_fac/44/）"
      locator: "§1 Introduction, p. 2（自存档稿）；Abstract, p. 1"
      quote: "Dunn's insight (1964) was to retain the rank sums from the omnibus test, and to construct a z test statistic approximation to the exact rank sum statistic: Dunn's test is the appropriate procedure following a Kruskal-Wallis test."
      note: "自存档 PDF 顶部声明为 pre-submission manuscript；正式版摘要措辞见 PDXScholar 著录。"
    - id: dinno2015-bh
      role: primary
      access: free_to_read
      url: "https://alexisdinno.com/files/Dinno2014b.pdf"
      cite: "Dinno, A. (2015). The Stata Journal, 15(1), 292-300."
      locator: "§2.3 Options (bh); §5.2 Multiple comparisons adjustments, eq. (7)"
      quote: "bh specifies a Benjamini-Hochberg adjustment where the false discovery rate (FDR) is adjusted sequentially by adjusting the p-values of each pairwise test as ordered from largest to smallest with p[m/(m+1-i)], where i is the position in the ordering as per Benjamini and Hochberg (1995). Stata will report a maximum Benjamini-Hochberg-adjusted p-value of 1. Such FDR-adjusted p-values are sometimes referred to as q-values in the literature."
    - id: lee2018-fdr
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6193594/"
      cite: "Lee, S., & Lee, D. K. (2018). Korean Journal of Anesthesiology, 71(5), 353-360."
      locator: "Controlling the false discovery rate: Benjamini-Hochberg adjustment, p. 359"
      quote: "An alternative to controlling the FWER is to control the FDR using the Benjamini-Hochberg and Benjamini & Yekutieli adjustments. The FDR controls the expected rate of the null hypothesis that is incorrectly rejected (type I error) in the rejected hypothesis list. It is less conservative. By performing the comparison procedure with a greater power compared to FWER control, the probability that a type I error will occur can be increased."
    - id: conover1979
      role: primary
      access: free_to_read
      url: "https://www.osti.gov/servlets/purl/6057803/"
      cite: "Conover, W. J., & Iman, R. L. (1979). On Multiple-Comparisons Procedures. Los Alamos Scientific Laboratory Informal Report LA-7677-MS. https://doi.org/10.2172/6057803"
      locator: "Abstract, p. 1; §I Introduction, p. 2"
      quote: "Some of the more popular multiple-comparisons procedures are discussed and compared. Some new nonparametric methods are introduced. One procedure is an analog to the Fisher's least significant difference method for the completely randomized design. Some simulation studies indicate this procedure is a reasonable nonparametric method to use."
    - id: agbangba2024-nonparam
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11637079/"
      cite: "Agbangba, C. E., et al. (2024). Heliyon, 10(3), e25131."
      locator: "§3.2 Holding of post-hoc test assumptions"
      quote: "Non-parametric post-hoc tests include the Dunn, Steel, Nemenyi, and Steel-Dwass tests."
    - id: zar2010-np
      role: secondary
      access: print
      cite: "Zar, J. H. (2010). Biostatistical Analysis (5th ed.). Pearson. Ch. 11 'Multiple Comparisons'（Nonparametric Multiple Comparisons 一节）"
    - id: hollander2014
      role: secondary
      access: print
      cite: "Hollander, M., Wolfe, D. A., & Chicken, E. (2014). Nonparametric Statistical Methods (3rd ed.). Wiley. Ch. 6 'The One-Way Layout'（含 Dwass-Steel-Critchlow-Fligner 程序）"
    - id: dunn1964
      role: secondary
      access: paywalled
      cite: "Dunn, O. J. (1964). Multiple comparisons using rank sums. Technometrics, 6(3), 241-252.（方法原始文献，降为 secondary；注意与 Dunn 1961 JASA 的 Bonferroni-Dunn α 分割不是同一个方法）"
```

---

### 本批遗留（详见 `unresolved` 字段）

1. **D-09 的规范性缺口**：只拿到「用得最多」的实证，拿不到「期刊要求」。文案口径必须改。
2. **Sauder & DeMars 2019 (AMPPS) 取不到**：这是唯一从**功效**角度直接论证 Games-Howell 该当默认的现代文献，SAGE 全线 403/超时，机构库只有摘要。D-11 的 default 目前是「可得性 + 惯例 + Lee & Lee 的 α 保持性」三者支撑，功效侧证据缺位。
3. **Chew 1976（FSHS《Uses and abuses of DMRT》）**：平台标称免费但 view/download 两个 URL 都 403。
4. **Tukey 1991（Statistical Science）不是 OA**：Project Euclid 实测付费，$30/篇，无法作为 Tukey 1953 的可核替代。
5. **DSCF 无专门 OA primary**；**Benjamini & Hochberg 1995 原文付费**（已用两条 OA 二手替代）。
6. **中文出处未找到**：农学 Duncan 惯例的中文核心期刊方法学综述，公网检索只返回博客/百科，CNKI 全文不可抓。


---

## 五 · 分类资料族 D-13~D-15（2×2 列联表 / 期望频数规则 / 有序×二分趋势检验）

## 分类资料族 D-13 ~ D-15：开放获取出处改写

> **本批总述。** 三条规则的 primary 已全部换成可被 agent 直接 WebFetch 打开全文的文献，教科书降为 secondary。
> 有两处必须让方法卡的维护者知道，否则会在 Methods 段里写出经不起审稿的话：
>
> 1. **D-14 的 `default=fisher` 与本批最强的现代 OA 证据（Campbell 2007）是冲突的。** Campbell 的模拟结论是：只要最小期望频数 ≥1，就该用 `N−1` 卡方而不是 Fisher，因为 Fisher 过于保守、损失功效。我把这条作为 `does_not_support` 的**反证条目**照实收录了，没有藏起来。规则可以维持 `default=fisher`（教科书与多数中文期刊审稿人认这个），但方法卡上应挂一条注记。
> 2. **规则里的 `N>40` 找不到任何英文同行评议出处**，它是中文医学统计教科书（孙振球一系）的教学约定。OA 侧唯一有模拟证据的总样本量锚点是 Campbell 2007 的 `N>25`。详见 unresolved。

---

### D-13　2×2 列联表 · 全部期望频数 ≥5 · N>40 → `default = chi2`（不加 Yates）

**primary（OA，已取全文）：Campbell 2007，作者自存档 accepted manuscript**

原引的 Campbell 2007 *Stat Med* 经 Unpaywall + OpenAlex 双查确认 **closed**（`oa_status: closed`，零仓储副本）。但作者本人在 <https://www.iancampbell.co.uk/twobytwo/> 上挂了 accepted manuscript 的 PDF，本次已完整下载并逐字校对（964 KB，正文 28 页版式）。这属于作者自存档，符合「能真正打开全文」的判据。

支持「**不加 Yates**」的原文（§4.2）：

> However, in comparative trials and cross-sectional studies, one or both sets of marginal totals are free to vary and successive possible values of (ad - bc) differ by considerably less than N. So Yates’s continuity adjustment of N/2 is in fact a large overcorrection, and is inappropriate.

支持「**全部期望频数 ≥5 时 Pearson 卡方成立**」并顺带给出 tolerance 依据的原文（§3.1.1，配 Figure 2 上图）：

> The bottom line shows the effect of restricting use of the test to tables where all expected numbers are at least 5, i.e. to Cochran’s recommendations. This is effective in abolishing the excessively high rate of Type I errors, so that the maximum rate lies between 0.05 and 0.06 for most values of N greater than 25.

**⚠️ 一处必须写进注记的偏差**：Campbell 的首选是 `N−1` 卡方（Pearson 卡方把 N 换成 N−1），不是原味 Pearson 卡方。他自己在 §1 里说明了这个差别在大样本下可忽略：

> The difference from the original version is small for large sample sizes, but becomes crucial in analyses with small sample sizes, which is the subject of this paper.

在 D-13 的适用域（N>40 且全部期望 ≥5）里，`N−1` 与 `N` 版本的统计量相差不到 2.5%，因此把 `chi2` 作为 default 是可辩护的；但若日后要提升精度，`N−1` 卡方是有 OA 证据背书的升级路径。

**corroborating（OA）**：Choi/Blume/Dupont 2015 *PLoS ONE*（CC BY）指出 Yates 校正继承了 Fisher 精确检验的全部保守性批评 ——

> Less well-known is that many of the criticisms of Fisher’s exact test also apply to Yates’ continuity-corrected chi-square test [1], because it makes the χ2 distribution under the null closer to the hypergeometric distribution on which Fishers exact test is based.

**secondary（教科书，纸质）**：Armitage / Berry / Matthews 4e (2002) —— Campbell §1 逐字记载该版立场是「永不使用 Yates 校正」（`Armitage et al. [7] recommends that it is never used - a change from previous editions of the same textbook.`）。这是审稿人最认的反 Yates 权威。

```yaml
D-13:
  citations:
    - id: campbell2007-yates
      role: primary
      access: oa
      url: "https://www.iancampbell.co.uk/twobytwo/files/campbell_twobytwo_preprint.pdf"
      cite: "Campbell I. Chi-squared and Fisher–Irwin tests of two-by-two tables with small sample recommendations. Statistics in Medicine. 2007;26(19):3661-3675. doi:10.1002/sim.2832 (author self-archived accepted manuscript)"
      locator: "§4.2 'Whether Yates's continuity adjustment should be applied', para. 2 (self-archived MS p.17-18 of 28)"
      quote: "However, in comparative trials and cross-sectional studies, one or both sets of marginal totals are free to vary and successive possible values of (ad - bc) differ by considerably less than N. So Yates's continuity adjustment of N/2 is in fact a large overcorrection, and is inappropriate."
    - id: campbell2007-e5
      role: primary
      access: oa
      url: "https://www.iancampbell.co.uk/twobytwo/files/campbell_twobytwo_preprint.pdf"
      cite: "Campbell I. Chi-squared and Fisher–Irwin tests of two-by-two tables with small sample recommendations. Statistics in Medicine. 2007;26(19):3661-3675. doi:10.1002/sim.2832"
      locator: "§3.1.1 'Policies based on a minimum expected number', para. 2, Figure 2 (upper) (self-archived MS p.12-13 of 28)"
      quote: "The bottom line shows the effect of restricting use of the test to tables where all expected numbers are at least 5, i.e. to Cochran's recommendations. This is effective in abolishing the excessively high rate of Type I errors, so that the maximum rate lies between 0.05 and 0.06 for most values of N greater than 25."
    - id: choi2015-yates
      role: primary_supporting
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4388855/"
      cite: "Choi L, Blume JD, Dupont WD. Elucidating the foundations of statistical inference with 2 x 2 tables. PLoS ONE. 2015;10(4):e0121263. doi:10.1371/journal.pone.0121263"
      locator: "Methods > Background > 'Summary of controversy'"
      quote: "Less well-known is that many of the criticisms of Fisher's exact test also apply to Yates' continuity-corrected chi-square test [1], because it makes the chi-square distribution under the null closer to the hypergeometric distribution on which Fishers exact test is based."
    - id: armitage-berry-matthews-4e
      role: secondary
      access: print
      cite: "Armitage P, Berry G, Matthews JNS. Statistical Methods in Medical Research. 4th ed. Oxford: Blackwell Science; 2002. (该版立场：Yates 校正永不使用；见 Campbell 2007 §1 对该书的转述)"
    - id: agresti-cda-3e-ch3
      role: secondary
      access: print
      cite: "Agresti A. Categorical Data Analysis. 3rd ed. Hoboken: Wiley; 2013. Chapter 3 'Inference for Contingency Tables'"
  notes:
    - "Campbell 首选 'N−1' 卡方而非原味 Pearson 卡方；在 N>40 且全部期望≥5 的适用域内两者差异 <2.5%，故 default=chi2 可辩护。'N−1' 是有 OA 证据的升级路径。"
    - "tolerance 依据：全部期望≥5 的限制下，Pearson 卡方最大 I 类错误在 N>25 时落在 0.05–0.06。规则用的 N>40 比这更保守。"
```

---

### D-14　任一期望频数 <5，或 N≤40 → `allowed = [fisher, chi2_yates]`，`default = fisher`

**primary #1（OA）：Bewick / Cheek / Ball 2004，*Critical Care* Statistics review 8**

这一篇同时给出了「Cochran 规则」的逐字表述**和**「小样本用 Yates 或 Fisher」的处置建议，正好一一对应 D-14 的 allowed 集合。原文（节 “Limitations”）：

> For a χ2 test of association, a recommendation on sample size that is commonly used and attributed to Cochran [5] is that no cell in the table should have an expected frequency of less than one, and no more than 20% of the cells should have an expected frequency of less than five. If the expected frequencies are too small then it may be possible to combine categories where it makes sense to do so. For two by two tables, Yates' correction or Fisher's exact test can be used when the samples are small.

同文节 “Yates' continuity correction” 还交代了两者的偏保守方向与选择倾向：

> There is some controversy about which method is preferable for smaller samples, but Bland [5] recommends the use of Fisher's or Yates' test for a more cautious approach.

**primary #2（OA，diamond）：Kim 2017，*Restor Dent Endod***（CC BY-NC）——把「>20% 单元格期望 <5 → 必须用 Fisher」说成硬性处置：

> Fisher's exact test is practically applied only in analysis of small samples but actually it is valid for all sample sizes. While the chi-squared test relies on an approximation, Fisher's exact test is one of exact tests. Especially when more than 20% of cells have expected frequencies < 5, we need to use Fisher's exact test because applying approximation method is inadequate.

**⚠️ 反证（必须挂注记）**：Campbell 2007 §5 的结论与 `default=fisher` 直接冲突 ——

> the best policy in the analysis of 2 × 2 tables from either comparative trials or cross-sectional studies is: (1) Where all expected numbers are at least 1, analyse by the ‘N - 1’ chi squared test (the K. Pearson chi squared test but with N replaced by N - 1), (2) Otherwise, analyse by the Fisher-Irwin test, with two-sided tests carried out by Irwin’s rule (taking tables from either tail as likely, or less, as that observed). This policy extends the use of the chi squared test to smaller samples (where the current practice is to use the Fisher-Irwin test), with a resultant increase in the power to detect real differences.

Choi 2015（节 “Conservatism”）从模拟侧佐证了同一件事：

> Conservatism means that the actual probability of rejecting the null hypothesis is less than the nominal level. Fisher’s exact test is indeed conservative, and this is easily verified by simulation.

**处置建议**：保留 `default=fisher`（中文期刊与教科书口径），但在方法卡里加一条 tolerance 注记：「当 1 ≤ 最小期望频数 < 5 时，Fisher 精确检验偏保守，现代文献（Campbell 2007）主张改用 `N−1` 卡方以换取功效；若结果处于临界，应报告两者。」`chi2_yates` 保留在 allowed 里是为了兼容审稿要求，**不应作为 default**（理由见 D-13 的 §4.2 引文）。

```yaml
D-14:
  citations:
    - id: bewick2004-cochran-rule
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC420070/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 8: Qualitative data - tests of association. Critical Care. 2004;8(1):46-53. doi:10.1186/cc2428"
      locator: "Section 'Limitations', paras. 1-2"
      quote: "For a chi-square test of association, a recommendation on sample size that is commonly used and attributed to Cochran [5] is that no cell in the table should have an expected frequency of less than one, and no more than 20% of the cells should have an expected frequency of less than five. If the expected frequencies are too small then it may be possible to combine categories where it makes sense to do so. For two by two tables, Yates' correction or Fisher's exact test can be used when the samples are small."
    - id: kim2017-fisher
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5426219/"
      cite: "Kim HY. Statistical notes for clinical researchers: Chi-squared test and Fisher's exact test. Restorative Dentistry & Endodontics. 2017;42(2):152-155. doi:10.5395/rde.2017.42.2.152"
      locator: "Section \"Fisher's exact test\", para. 1 (p.154)"
      quote: "Fisher's exact test is practically applied only in analysis of small samples but actually it is valid for all sample sizes. While the chi-squared test relies on an approximation, Fisher's exact test is one of exact tests. Especially when more than 20% of cells have expected frequencies < 5, we need to use Fisher's exact test because applying approximation method is inadequate."
    - id: campbell2007-counterevidence
      role: counter_evidence          # 反证：不支持 default=fisher
      access: oa
      url: "https://www.iancampbell.co.uk/twobytwo/files/campbell_twobytwo_preprint.pdf"
      cite: "Campbell I. Chi-squared and Fisher–Irwin tests of two-by-two tables with small sample recommendations. Statistics in Medicine. 2007;26(19):3661-3675. doi:10.1002/sim.2832"
      locator: "§5 'CONCLUSIONS AND RECOMMENDATIONS' (self-archived MS p.18-19 of 28)"
      quote: "the best policy in the analysis of 2 x 2 tables from either comparative trials or cross-sectional studies is: (1) Where all expected numbers are at least 1, analyse by the 'N - 1' chi squared test (the K. Pearson chi squared test but with N replaced by N - 1), (2) Otherwise, analyse by the Fisher-Irwin test, with two-sided tests carried out by Irwin's rule (taking tables from either tail as likely, or less, as that observed). This policy extends the use of the chi squared test to smaller samples (where the current practice is to use the Fisher-Irwin test), with a resultant increase in the power to detect real differences."
    - id: choi2015-conservatism
      role: counter_evidence
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4388855/"
      cite: "Choi L, Blume JD, Dupont WD. Elucidating the foundations of statistical inference with 2 x 2 tables. PLoS ONE. 2015;10(4):e0121263. doi:10.1371/journal.pone.0121263"
      locator: "Methods > Background > 'Conservatism', para. 1"
      quote: "Conservatism means that the actual probability of rejecting the null hypothesis is less than the nominal level. Fisher's exact test is indeed conservative, and this is easily verified by simulation."
    - id: cochran1954
      role: secondary
      access: paywalled
      cite: "Cochran WG. Some methods for strengthening the common chi-square tests. Biometrics. 1954;10(4):417-451. (原始出处，付费，降为 secondary)"
    - id: agresti-cda-3e-ch3
      role: secondary
      access: print
      cite: "Agresti A. Categorical Data Analysis. 3rd ed. Hoboken: Wiley; 2013. Chapter 3 'Inference for Contingency Tables'"
  notes:
    - "N<=40 这一支无 OA primary，见 unresolved；它是中文教科书约定，Campbell 2007 的模拟证据支持的阈值是 N>25。"
    - "1 <= min(E) < 5 时 Fisher 偏保守；若 p 值临界，建议同时报告 'N-1' 卡方。"
    - "chi2_yates 仅为兼容审稿要求保留在 allowed，不得设为 default。"
```

---

### D-15　有序分类 × 二分结局（剂量-反应形态）→ `default = cochran_armitage`

**primary #1（OA）：Bewick 2004 节 “Test for trend”** —— 给出触发条件（自然次序）、检验名（Cochran–Armitage）、以及 1 df 分解这套完整机制：

> Because the categories of AVPU have a natural ordering, it is appropriate to ask whether there is a trend in the proportion dying over the levels of AVPU. This can be tested by carrying out similar calculations to those used in regression for testing the gradient of a line

> The difference between the χ2 test statistic for trend and the χ2 test statistic in the original test is 19.38 - 19.33 = 0.05 with 2 - 1 = 1 degree of freedom, which provides a test of the departure from the trend. This departure is very insignificant and suggests that the association between survival and AVPU classification can be explained almost entirely by the trend. Some computer packages give the trend test, or a variation. The trend test described above is sometimes called the Cochran–Armitage test, and a common variation is the Mantel–Haentzel trend test.

同文还给出了**趋势检验专属的样本量 tolerance**（与卡方检验的期望频数规则不同，这点常被搞混）：

> In the trend test the individual cell sizes are not important but the overall sample size should be at least 30.

**primary #2（PMC 免费）：Zheng / Joo / Yang 2009，*Ann Hum Genet*** —— 提供 D-15 最关键的一句「为什么 default 是趋势检验而不是卡方」，且**同时给出反向条件**（正好对应 allowed 里还留着 `chi2`）：

> The robustness of Pearson’s test comes from its use of the data-driven scores which is not necessarily ordered. On the other hand, the trend test is more powerful when the scores are correctly specified in terms of the orders. In addition, because the scores for Pearson’s test are random, Pearson’s test needs higher DF than the trend test that uses fixed scores. Therefore, when the true GRRs are ordered, the trend test with smaller DF is more powerful than Pearson’s test with higher DF.

> When the GRRs are not ordered, Pearson’s test is always most powerful under the models of consideration, while the CATT loses substantial power when the ordered scores are still used.

（该文语境是遗传关联研究，GRR = genotype relative risk。命题本身是关于「有序分数 vs 数据驱动分数」的一般结论，但引进 Methods 段时应避免直接套用其遗传学措辞。）

**primary #3（OA，CC BY-NC）：Hothorn 2014，*Toxicology Research*** —— 给 default 划出边界：CA 只对**近似线性**的剂量-反应敏感，凹/凸形态会掉功效。这是 D-15 触发条件里「剂量-反应形态」四个字的证据来源，也是 tolerance 的依据。

> Several guidelines highlight as an important criterion for a positive result the demonstration of a dose-related trend. This seems obvious and a simple task. But, a linear regression model reveals reduced power for concave and convex curves; this is the case for the widely-used Cochran–Armitage28 and Jonckheere trend tests29 (e.g. recommended in ecotoxicology11). Therefore, trend tests are needed which are sensitive to any shapes of the dose–response relationships and take the comparison against NC into account.

> The Cochran–Armitage trend test is mainly sensitive to linear shapes and therefore Williams-type modifications can be recommended instead.

```yaml
D-15:
  citations:
    - id: bewick2004-trend
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC420070/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 8: Qualitative data - tests of association. Critical Care. 2004;8(1):46-53. doi:10.1186/cc2428"
      locator: "Section 'Test for trend', para. 2"
      quote: "Because the categories of AVPU have a natural ordering, it is appropriate to ask whether there is a trend in the proportion dying over the levels of AVPU. This can be tested by carrying out similar calculations to those used in regression for testing the gradient of a line"
    - id: bewick2004-trend-name
      role: primary
      access: oa
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC420070/"
      cite: "Bewick V, Cheek L, Ball J. Statistics review 8: Qualitative data - tests of association. Critical Care. 2004;8(1):46-53. doi:10.1186/cc2428"
      locator: "Section 'Test for trend', paras. 4-5"
      quote: "The difference between the chi-square test statistic for trend and the chi-square test statistic in the original test is 19.38 - 19.33 = 0.05 with 2 - 1 = 1 degree of freedom, which provides a test of the departure from the trend. This departure is very insignificant and suggests that the association between survival and AVPU classification can be explained almost entirely by the trend. Some computer packages give the trend test, or a variation. The trend test described above is sometimes called the Cochran-Armitage test, and a common variation is the Mantel-Haentzel trend test."
    - id: zheng2009-power
      role: primary
      access: free_to_read
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2679501/"
      cite: "Zheng G, Joo J, Yang Y. Pearson's test, trend test, and MAX are all trend tests with different types of scores. Annals of Human Genetics. 2009;73(2):133-140. doi:10.1111/j.1469-1809.2008.00500.x"
      locator: "Methods > 'Pearson's Test', paragraph following RESULT 1 (p.135)"
      quote: "The robustness of Pearson's test comes from its use of the data-driven scores which is not necessarily ordered. On the other hand, the trend test is more powerful when the scores are correctly specified in terms of the orders. In addition, because the scores for Pearson's test are random, Pearson's test needs higher DF than the trend test that uses fixed scores. Therefore, when the true GRRs are ordered, the trend test with smaller DF is more powerful than Pearson's test with higher DF."
    - id: zheng2009-reverse
      role: primary
      access: free_to_read
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2679501/"
      cite: "Zheng G, Joo J, Yang Y. Pearson's test, trend test, and MAX are all trend tests with different types of scores. Annals of Human Genetics. 2009;73(2):133-140."
      locator: "Results/Discussion, Table 3 discussion (p.137-138)"
      quote: "When the GRRs are not ordered, Pearson's test is always most powerful under the models of consideration, while the CATT loses substantial power when the ordered scores are still used."
    - id: hothorn2014-linear-only
      role: primary
      access: oa
      url: "https://repo.uni-hannover.de/bitstreams/8a07af88-fab6-4466-9c47-e5cfdcb59406/download"
      cite: "Hothorn LA. Statistical evaluation of toxicological bioassays - a review. Toxicology Research. 2014;3(6):418-432. doi:10.1039/c4tx00047a (CC BY-NC 3.0)"
      locator: "§3.2 'Trend tests', para. 1 (p.421); and §5 'Long-term carcinogenicity assays' (p.424)"
      quote: "The Cochran-Armitage trend test is mainly sensitive to linear shapes and therefore Williams-type modifications can be recommended instead."
    - id: agresti-cda-3e-ch3
      role: secondary
      access: print
      cite: "Agresti A. Categorical Data Analysis. 3rd ed. Hoboken: Wiley; 2013. Chapter 3 'Inference for Contingency Tables' (有序分类的线性趋势 / linear-by-linear association)"
  notes:
    - "tolerance（样本量）：趋势检验不看单元格期望频数，看总样本量，Bewick 2004 'Limitations' 给出 N>=30。这与 D-13/D-14 的期望频数规则是两套判据，勿混用。"
    - "tolerance（形态）：CA 只对近似线性的剂量-反应敏感；凹/凸形态功效下降（Hothorn 2014）。若图形明显非单调线性，应回退 chi2 或改 Williams-type / Jonckheere-Terpstra。"
    - "Zheng 2009 语境为遗传关联研究（GRR），引用时应改写为一般化措辞，不要把 'GRR' 带进 Methods 段。"
```

---

### 本批检索与取全文记录（可复核）

| 目标 | 手段 | 结果 |
|---|---|---|
| Campbell 2007 OA 状态 | Unpaywall API + OpenAlex（DOI 10.1002/sim.2832） | `closed`，零仓储副本 |
| Campbell 2007 全文 | 作者官网 iancampbell.co.uk → `files/campbell_twobytwo_preprint.pdf` | ✅ HTTP 200，964 KB，pdftotext 已提取并逐字校对 |
| Bewick 2004 全文 | Europe PMC `PMC420070/fullTextXML` | ✅ 70 KB JATS XML，节标题完整 |
| Kim 2017 全文 | Europe PMC `PMC5426219/fullTextXML` | ✅ 42 KB |
| Zheng 2009 全文 | PMC HTML `PMC2679501` | ✅ 192 KB（OA subset 无 XML，走 HTML） |
| Choi 2015 全文 | Europe PMC `PMC4388855/fullTextXML` | ✅ CC BY |
| Hothorn 2014 全文 | RSC 403 → 汉诺威机构库 bitstream | ✅ 544 KB PDF，CC BY-NC 3.0 |
| Nagel 2024 (MEE) 全文 | Wiley 402 / DOAJ 403 / St Andrews 库故障 ×3 | ❌ 见 unresolved |
| Lydersen 2009 | Unpaywall + NTNU Open 检索 | ❌ closed，无合法自存档 |
| `N>40` 阈值 | Europe PMC 全文短语检索 6 组 + 中英文 WebSearch 各 2 轮 | ❌ 无同行评议方法学出处，见 unresolved |
| CATT 临床口径功效文献 | Europe PMC TITLE/全文检索 4 组 + WebSearch 2 轮 | ❌ 仅命中遗传学/毒理学专用文献 |

合计 WebSearch 8 次、WebFetch 8 次、直接 HTTP 取全文/查 API 约 22 次。


---

## 六 · 未解决与存疑

### 6.1 回核未通过的候选出处(不得进总览表)

> 回核判据三项全过才算通过:① URL 真能打开且是全文 ② 摘录逐字存在 ③ 那段话真的支持这条规则(沾边不算)。

**D-01** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> [出处2/6 · Kim 2019 · Welch 节第 3 段] 摘录逐字命中（PDF 第 4 页，含原文错字 "Leven's"，逐字保留无误）。但**不支持规则**：这是对该文示例数据集的一句具体判词——因 Levene p=0.334 不显著，故对**这批数据**用 Welch 不合适；它背书的正是 Levene 显著性条件分流的两步法。若 D-01/D-03 的 default 是 welch-always（D-03 明确引 Delacre 的 welch-always 论证为核心），这条引文的结论与 default 相反；即便 default 是两步法，它也只是个案演算而非一般性建议。属「同话题但立场相反」，建议撤下或改标为反例。

**D-02** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> [出处5/5 · Rochon 2012 · PMC3444333] 全文可开，两句均逐字存在（前句在 Abstract→Results，后句在正文 Conclusions 首句）。但**不支持规则、方向相反且摘引有选择性**：该文批判的正是「先做正态性检验、再据其结果在 t 与 Mann-Whitney 间分流」这一两阶段程序本身——若 D-02 的实现就是这种前置检验分流，Rochon 是反证不是佐证。且摘录砍掉了紧随其后的原文 "Interestingly, the overall Type I error rate and power of the entire two-stage procedure remained within acceptable limits." 与 Conclusions 的 "From a practical perspective, however, preliminary testing does not seem to cause much harm…The worst that can be said is that preliminary testing is unnecessary"，使其读起来比原文严厉得多。真正能支撑 D-02 的是该文末句 "If the application of the t test is doubtful, the unconditional use of nonparametric tests seems to be the best choice"（且是**无条件**使用，不是检验后分流）。建议改引该句并把本条重标为 caveat。

**D-03** — URL 可开 · 🔴 摘录不在原文(拼接或改写) · 支持规则

> [出处4/4 · Kim TK 2015 · europepmc PMC4667138] URL 可开（该页为 JS 渲染，curl 只拿到壳；经 Europe PMC 全文 XML 接口与 NCBI PMC 镜像 pmc.ncbi.nlm.nih.gov/articles/PMC4667138/ 双向确认确为 OA 全文，故 url_opens=true，但建议改引 NCBI 那条 URL）。⚠️摘录有一处**改字**：原文（两个独立渲染源一致）为 "…which follows a t distribution can **is** used."（期刊排印错误），引文写成 "can **be** used"。其余部分逐字无误，属静默纠错而非编造——但该调研员在别处刻意保留了 "are can be"、"Wincoxon" 等原样错字，此处口径不一致，按「逐字」标准判 false。内容支持成立（Levene/Bartlett 查方差齐性，不齐则用 Welch-Satterthwaite 自由度的统计量）。

**D-07 / Welch 1951 (Biometrika 38(3-4):330-336)** — 🔴 URL 打不开/付费墙 · 🔴 摘录不在原文(拼接或改写) · 🔴 不支持规则

> 实测 OUP 页面确为付费墙：显示『You do not currently have access to this article』『This content is only available as a PDF』，24 小时租阅 USD 43 / EUR 39 / GBP 33，页面无摘要正文，只有首页缩略图。著录的题名/作者/年/卷期/页码（38(3-4):330-336）与 OUP 条目页一致。⚠️ 判 false 是按规则口径（付费=url_opens false、无逐字摘录=quote_present false），**不等于调研员造假**：他已主动标 access=paywalled_abstract_only，并在摘录位置如实写明无法取得原文、JSTOR 同样付费、1951 年论文无预印本/自存档。处理建议：作为方法出处保留但标记『未经全文核验』，不得进入需要摘录佐证的闸门；真正承重的出处用 Delacre 2019 与 Kroeger 2021（二者均已全文核实）。

**D-08 / Blanca 2017 (Psicothema 29(4):552-557)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> URL 可开（redalyc PDF），摘录逐字属实——但**方向相反**。首轮 pdftotext -layout 因双栏交错未命中，改用无 -layout 重取后完整命中，含被截断的尾句原文为『...there is no reason to prefer the Kruskal-Wallis test under the conditions studied in the present paper.』；摘要 Results 句亦逐字命中。该段的结论是：KW 会把连续数据降为秩、损失信息，且其原假设与 F 检验不同（除非各组分布形状完全相同），因此在其研究条件下**没有理由优先选 KW**；配合『F-test 在 100% 情形下对 I 类错误稳健』，整体是在为『非正态时仍可用 ANOVA』背书。若 D-08 的 default 写成『非正态 → Kruskal-Wallis』，把此文列为 supports 就是拿反对证据当支持。建议：改标为 caveat/boundary（限制条件），或把 D-08 改写为『非正态**且**小样本/形状同质时才用 KW；大样本或仅轻中度偏态时 F 检验仍稳健』。

**D-08 / Fagerland 2012 (BMC Med Res Methodol 12:78)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> URL 可开。摘录逐字属实——⚠️ 这里有一个必须记下的过程事实：WebFetch 的摘要模型第一次把这段**改写**成了『Research authors that use non-parametric tests... For large studies, ...』并声称是原文；我下载 BMC 原始 PDF 用 pdftotext 比对后确认**调研员的版本才是逐字原文**（『Using non-parametric tests in large studies... For studies with a large sample size, ...』）。定位补充的 Discussion 句『First, medical research authors may use a test for normality to decide whether to use a t-test or a non-parametric test. We strongly advise against that practice.』亦逐字命中（中间被页眉穿插，属提取假象）。判 really_supports=false 的理由同 Blanca：该文明确**反对**用正态性检验来决定选参数还是非参数检验，并主张大样本重偏态数据仍应用 t 检验——与『非正态 → 非参数』的 default 相悖。作为 caveat 引用完全正当，作为 supports 则是误引。此文针对两组 t/WMW，严格说也不是 ≥3 组 ANOVA 场景，射程与 D-08 不完全重合。

**D-10** — URL 可开 · 🔴 摘录不在原文(拼接或改写) · 支持规则

> Midway/PeerJ Tukey HSD 段——**真实拼接，判不通过**。原文为：「…widely applied for parametric unplanned comparisons ( Tukey, 1949 ), although the lesser known Tukey-Kramer test ( Kramer, 1956 ) should be used in cases of unequal sample size. Our simulations found…」摘录把中间「although the lesser known Tukey-Kramer test… unequal sample size.」整句删掉、且**未加省略号**，把两处非相邻文字直接接成一句。被删的恰恰是「不等样本量时应改用 Tukey-Kramer」这一限定条件，即 D-10 最容易被误用的那个 caveat。内容本身（Tukey HSD 比 Dunn-Šidák 更不保守、比 Bonferroni 的 II 类错误率低、总体推荐）在原文中确实存在且支持 D-10，所以这是**引文格式造假风险**而非结论造假：必须补回被删句或改用省略号。

**D-10** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> Juarros-Basterretxea et al. (2024)。PDF 可开、是 Methodology 20(2):84–99 全文。摘录本身逐字命中——但它是**参考文献表里的一行著录**（p.99，Tukey 1953 未刊手稿）。一条参考文献条目在逻辑上不可能支持任何统计决策规则，它只能证明「Tukey 1953 这个常被引的出处从未正式出版」这一 provenance 事实。→ really_supports 判 false。**不是编造**：researcher 在定位里另引的 p.86 正文「Tukey's HSD… is the most common used post-hoc test… It is recommended when balanced groups are compared」经查逐字存在且页码正确（该段落位于页脚 87 之前，即 p.86），那句才是真正的支持性证据。建议把摘录换成 p.86 那句，把 1953 著录降为脚注。

**D-11** — URL 可开 · 🔴 摘录不在原文(拼接或改写) · 🔴 不支持规则

> Juarros et al. Condition 2（p.90）——**本批最严重的一条，两项都不通过**。①拼接：原文为「…when groups were heteroscedastic and balanced, **but none of the tests assuming heteroscedasticity was accurate for all sample sizes** (see Table 2).」摘录删掉了加粗那句限定、未加省略号，把「(see Table 2)」直接接到「balanced」后面；被删的正是削弱结论的 caveat。另原文作「N = 3000」（摘录写 N = 3,000）。②方向问题：紧随其后的原文是「Nevertheless, no test was enough accurate for sample sizes of N = 30 and N = 90…」——即**小样本下没有任何不等方差检验达标**，这与 D-11 引用 Lee & Lee 得出的「n<50 用 Dunnett's T3」直接冲突；且该文 Discussion（p.93 / p.95，两句经核均逐字存在）明说 Games-Howell「systematically liberal」、T3 比 T2 更 liberal 且表现更差。若 D-11 的 default 是 Games-Howell，这篇文献是**反证而非支持**。researcher 在定位里已如实附上这两句反向证据（值得肯定），但主摘录经拼接后读起来像是在为默认值背书。必须改写：要么改引 T2/T3 优于 Games-Howell 的结论并相应调整 D-11 的 default，要么明确标注为「与 default 冲突的证据」。

**D-12** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> Conover & Iman (1979) LA-7677-MS——**判不通过（沾边但方向相反）**。URL 可开、OSTI 全文 PDF，报告身份核实无误（W. J. Conover / Ronald L. Iman，Los Alamos，Issued: February 1979）。摘录逐字命中摘要（OCR 断词除外）。但：①摘要只是一段「本报告讨论并比较了若干常用多重比较程序、引入了一些新的非参数方法」的**内容梗概**，只字未提 Dunn's test、Kruskal-Wallis 之后该用什么、更没提 BH/FDR；它推荐的「reasonable nonparametric method」是**该文自己提出的 Fisher LSD 非参数类比 / 秩变换程序**，也就是 Conover-Iman 检验，与 Dunn 是**竞争关系**。②更关键：正文第 III 节明确转述 Lin & Haseman 的模拟结论——「The Nemenyi-Dunn and Steel-Dwass procedures seem to unduly stress protection against Type I errors at the expense of power to detect real differences when they exist」，并认为 KW+Mann-Whitney 平衡更好。即该文献的实质立场**不利于**把 Dunn 当默认。定位里另引的 §I 两阶段段落（经核逐字存在，OCR 把 α 显示为 a）确实支持「omnibus 显著才做成对比较」这一门控组件，但那不是被核的摘录。建议：要么把摘录换成 §I 两阶段那段并把本条的作用限定为「omnibus 门控」，要么整条撤掉。另注：这是 1979 年的国家实验室 informal report（灰色文献、未经同行评审），不宜作为 D-12 的主证据。

**D-14-3 (Campbell 2007, §5 结论——研究员自标【反证/边界证据】)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> URL 真开、摘录逐字命中(内页 19,§5 标题在内页 18,与「第 18–19 页」一致)。但按题设判据判 false:Campbell 的结论与 D-14 的 default **相反** —— 他主张只要所有期望数 ≥1 就用 'N−1' chi2,只有 E<1 才转 Fisher-Irwin,这个转 Fisher 的门槛远晚于『20% 格子 E<5』。⚠️ 重要区分:这**不是编造也不是误用** —— 研究员在条目上已显式标注【反证/边界证据,非支持】,属诚实标注。若下游把它当 supports 计入闸门才是问题;当前标注下应计入 caveat/对立观点,不应计入 D-14 的支持票。

**D-14-4 (Choi 2015, Conservatism 小节首段)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> URL 真开、摘录逐字命中、定位准确("Conservatism" 小标题后紧接的第 1 段,索引 11871→11884)。判 false 的理由:这段讲的是 **Fisher 精确检验本身保守**(实际拒绝概率低于名义水平),是对 D-14 所默认方法的**局限性陈述**,并不支持『期望数不足时应改用 Fisher』这条 default —— 若有倾向,反而是反向的。它是合格的 caveat 素材,不是 support。🔴 与 D-14-3 的落差值得点名:同一篇同一族里,D-14-3 被明确标了【反证】,这条**没有任何标注**,呈现形态即『支持出处』。若批次里它被计为 supports,就是一次未被标记的强度虚高(不是幻觉摘录,是关系错标)。

**D-15-4 (Zheng 2009, Table 3 讨论段)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> URL 真开、摘录逐字命中、定位准确(Results 中 Table 3 讨论段,紧接 'On the other hand, when the GRRs are not ordered (the bottom panel)...')。判 false 的两条理由:①它陈述的是 **CATT(D-15 的 default)在前提不成立时大幅掉功效、Pearson 反而最优**,是对 default 的**限制/反例**,不是对 default 的支持——与 D-14-4 同构,而 D-14-4 我也判了 false,口径一致;②**前提偷换**:Zheng 的条件是『GRR(效应)是否单调有序』,不是『类别是否有序』。这两者不等价——自变量是有序分类完全可以配非单调的响应。因此这段话真正证明的是『仅凭类别有序就默认 CATT 是不充分的』,若 D-15 的触发条件只写『有序分类』,这段实际在削弱而非支撑该 default。🔴 与 D-14-3 一样属反证性质,却**没有**被标【反证/边界证据】,呈现为支持出处 —— 这是本批次最需要修正的一处关系错标(仍非幻觉摘录)。

**D-21 (Yong & Pearce 2013, Tutor Quant Methods Psychol 9:79)** — URL 可开 · 摘录逐字在 · 🔴 不支持规则

> 🔴 本批唯一实质问题。URL 与摘录都没问题:tqmp.org PDF HTTP 200、16 页,整段逐字命中("For something to be labeled as a factor it should have at least 3 variables...(r > .70) but fairly uncorrelated with other variables."),定位 p.80 "What are the Requirements for Factor Analysis?" 亦属实。**问题在支持关系**:这段讲的是 EFA 里「一个因子至少要有 3 个测量变量、2 变量因子须谨慎解释」,即探索性因子分析的**因子保留/解释**规则,通篇不涉及信度系数、不涉及 Cronbach's α、不涉及信度阈值,也没说过「题目太少不能算 α」。它被挂在 D-21(信效度/α)下属于典型的「同一话题邻域但不支持该规则」。注意同一篇文献在 D-22 下已被再次引用(Bartlett/KMO 那条),那次的用法是对的 —— 这段 ≥3 变量的内容归到 D-22 才成立。除非 D-21 的规则文本里确实含有「每个维度至少 3 个题项」这类条款(那也应改引 Tavakol 里 "If the number of test items is too small it will also violate the assumption of tau-equivalence" 那句,它才是真正谈 α 的),否则此条应从 D-21 撤下。

### 6.2 找不到 OA primary 的(逐条写清已尝试什么)

#### D-01 ~ D-05 两组比较族

- Rasch D, Kubinger KD, Moder K. The two-sample t test: pre-testing its assumptions does not pay off. Statistical Papers. 2011;52(1):219–231. doi:10.1007/s00362-009-0224-x —— **未找到 OA 全文**。已试:Springer 正式页(付费)、ProQuest openview(无 PDF)、University of Vienna 机构库 ucrisportal 条目页(仅元数据、无全文、无摘要)、ResearchGate(request-PDF)、检索词 "Rasch Kubinger Moder 2011 pre-testing its assumptions does not pay off pdf/ repository / open access"。**替代方案**:该文的关键结论被 OA 的 Delacre 2017 逐字转述并引用(p.93「when the power of Levene's test is very high, the error rates of the conditional choice will be very close to Welch's error rate … see Rasch, Kubinger, & Moder, 2011」),因此在 welch-always doctrine 声明里以 Delacre 2017 为可核对 primary、Rasch 2011 仅作 further-reading,不作独立可核对出处。
- Zimmerman DW. A note on preliminary tests of equality of variances. British Journal of Mathematical and Statistical Psychology. 2004;57(1):173–181. doi:10.1348/000711004849222 —— **未找到 OA 全文**。已试:Wiley(付费)、PubMed(仅摘要)、PMC(无收录)、Semantic Scholar / ResearchGate(无自存档 PDF)。同上,经 Delacre 2017 p.93「When the power of Levene's test is medium, the error rates of the conditional choice will be somewhere between Student's and Welch's error rates (see, e.g., Zimmerman, 2004)」间接可核对。
- Ruxton GD. The unequal variance t-test is an underused alternative to Student's t-test and the Mann–Whitney U test. Behavioral Ecology. 2006;17(4):688–690. doi:10.1093/beheco/ark016 —— **仅摘要可读**(OUP article-abstract 页,全文 $58)。实测抓到的可引句只有引言片段「The Student's t-test performs badly when these variances are actually unequal, both in terms of Type I and Type II errors.」,不足以支撑「默认用 Welch」的完整论证,故不入 registry。
- **中文 OA 出处(pretest-classic 的中文期刊惯例侧)未落实**。已试检索:「中华流行病学杂志 统计学方法 两组均数比较 t检验 方差齐性检验 正态性检验 统计学报告规范」「两独立样本t检验 方差齐性 Levene 校正t检验 Welch 秩和检验 免费全文 中国循证医学杂志」。结果:①《临床肝胆病杂志》官网栏目转载文《医学论文中常见t检验应用错误分析》(https://www.lcgdbzz.org/custom/news/id/8784)可打开,但为无作者署名/无卷期页码的科普转载稿,**不可引**;②《数理医药学杂志》2023;36(7):481–485「极小样本两独立定量资料假设检验方法比较」(https://slyyx.whuznhmedj.com/journal/69.html)全文需付费,只拿到摘要级结论,且其结论(「当样本量极小时…均不建议使用Wilcoxon秩和检验进行统计推断」)**与 D-02 的 default=mann_whitney 相冲突** —— 既打不开全文又方向相反,不宜作 primary,但值得作为 D-02 的已知争议记录在案。建议下一步换检索面:中华医学会系列杂志「统计学方法」编读往来专栏、《中国卫生统计》《中华预防医学杂志》方法学述评,或直接引 SCI 收录的中国作者 OA 统计方法学综述。

#### D-06 / D-07 / D-08 / D-18（方差分析与线性回归）

- Welch (1951) Biometrika 38(3–4):330–336 —— **确认无 OA 全文**。已试：academic.oup.com 条目页（实测显示 "This content is only available as a PDF" + "You do not currently have access to this article."，24 小时租阅 USD 43）、JSTOR（vol.38 no.3/4 目录页，付费）、WebSearch 关键词 "Welch 1951 On the comparison of several mean values alternative approach Biometrika full text pdf"、PMC / arXiv / DOAJ / 机构库 均无（1951 年论文早于所有自存档制度，作者已故）。建议：把它的 role 从 primary 降为 `origin`（历史发明出处，access: paywalled），D-07 的可核对 primary 用 Delacre et al. 2019。
- **没有找到任何 OA 一次文献支持 D-08 的 `default = kruskal`**（即「非正态时应优先选 Kruskal–Wallis 而不是 Welch-ANOVA / F 检验」）。已试关键词："Kruskal-Wallis versus Welch ANOVA non-normal recommendation"、"which test to use non-normal three groups default"、"Kruskal-Wallis vs one-way ANOVA simulation type I error open access"、"non-normal data ANOVA still valid"；已试库：PMC / Europe PMC full-text XML API / DOAJ / TQMP（tqmp.org）/ Psicothema / PeerJ / rips-irsp.com。找到的只有**指南级映射**（Bewick 2004 Stat review 10、Mishra 2019 —— 二者都只说 KW 是 ANOVA 的非参数对应，并未与 Welch 做比较），以及**三条反向证据**（Blanca 2017：3 组非正态方差齐时「no reason to prefer the Kruskal-Wallis test」；Kroeger 2021：方差不齐时 KW 的 I 类错误同样膨胀；Fagerland 2012：大样本用非参数是「回答了错误的问题」）。→ 需要产品决策：要么把 D-08 的 default 改成条件分叉（方差不齐 → welch_anova；方差齐且样本小 → kruskal），要么在卡片上显式标注该默认值属**惯例性**而非**证据性**。
- D-06 的 `default = anova` 与其最强的现代 OA 文献存在**公开分歧**：Delacre et al. 2019 明确主张即便方差看起来齐也默认用 Welch（"we recommend using the W-test by default when comparing means"；"The F-test and F*-test should be avoided"）。已试寻找同等分量的、明确反对「Welch 作默认」的 OA 一次文献：未找到（Blanca 2017 只证明 F 对非正态稳健，前提是**方差齐**，不构成对 Delacre 的反驳）。→ 建议在 D-06 卡片加一条 `dissent` 引文而非隐藏。
- 中文期刊惯例类断言（如农学默认 Duncan）不在本批（D-06/07/08/18）范围内，未检索。

#### logistic / 生存 / 信效度(D-16, D-17, D-19, D-20, D-21, D-22)

- D-17「EPV<5 → blocked」的硬阈值:未找到任何 OA primary 直接主张「EPV<5 应拒绝拟合」。最接近的 OA 陈述是 van Smeden 2016 转述 Vittinghoff & McCulloch:"severe problems mainly occur in the EPV = 2 to EPV = 4 range"(Background)。已检索:van Smeden 2016(PMC5122171,取到全文)、van Smeden 2019 SMMR(PMC6710621,取到全文)、Riley 2020 BMJ m441(bmj.com 返回 HTTP 403,PMC 未检索到对应条目,未能取全文,故不作 primary)、Vittinghoff & McCulloch 2007 Am J Epidemiol(OUP 付费,无 OA 副本)、Peduzzi 1996 J Clin Epidemiol(Elsevier 付费)。关键词:"events per variable" / "EPV" / "1 variable per 10 events" / "minimum sample size logistic regression" / "separation Firth";库:PMC、BMC、SagePub、BMJ、Google/Bing 网页检索。
- D-17 的 fallback「建议 fisher」:未找到任何 OA(或付费)方法学文献主张「低 EPV 时改用 Fisher 精确检验」。文献一致的低 EPV 对策是 Firth 惩罚似然(van Smeden 2016 Discussion:"By applying Firth's correction, the problems associated with separation can be avoided.")或减少候选变量。建议把卡片的 fallback 从 fisher 改为 firth_logistic(+ 精简变量),否则这条规则将无出处可引。
- D-22「KMO≥0.6」这个具体数字:没有 OA primary 把 0.6 定为准入门槛。可核对的事实链是:Kaiser(1974, Psychometrika 39:31–36, p.35)把 .60s 标为 "mediocre"、<.50 标为 "unacceptable";该原文 Springer 付费,但 Watkins 2018(作者自存档 PDF,已取到全文)在 p.227 逐字转引了这段分级。现代最佳实践文献(Watkins 2018, p.226)写的是 "Overall KMO values ≥.70 are desired";另一份 OA 教程(Yong & Pearce 2013, p.88)用的是 ".50" 截断。已检索:Kaiser 1974 Psychometrika(付费)、Kaiser & Rice 1974 Little Jiffy Mark IV(EPM,付费)、Watkins 2018(取到)、Yong & Pearce 2013(取到)、Williams/Onsman/Brown 2010 AJP(SagePub 与 ResearchGate 两个 PDF 均取回失败:Socket closed / HTTP 403)、Goretzko 2021 Current Psychology(Springer 跳鉴权)。建议卡片把 0.6 明确标注为「Kaiser 分级的 mediocre 下限(可用但勉强)」,并把 0.7 作为「desired」提示。
- D-21 关于 α≥0.70 阈值的经典证伪文献 Lance, Butts & Michels 2006(Organizational Research Methods 9:202–220)未找到可打开的 OA 全文(Sage 付费;ResearchGate PDF 返回 HTTP 403)。已用 Ellis 2013(PMC3578733,OA)替代——该文直接逐字引用 Nunnally 1978 p.245 并论证该惯例无理据,证据链完整。
- D-21 的 McNeish 2018 只找到课程站镜像的 APA accepted 版 PDF(rameliaz.github.io),不是出版社 OA、也不是作者机构自存档,故标为 free_to_read 而非 oa。若审稿口径要求严格 OA,可用 Sijtsma 2009(PMC2792363)完全替代其论点。
- D-21「量表 ≥3 题」这个具体题数:没有任何文献给出「3」这个数字作为计算 α 的硬门槛。可引的最近证据是 Tavakol & Dennick 2011 p.54("If the number of test items is too small it will also violate the assumption of tau-equivalence and will underestimate reliability.")与 Yong & Pearce 2013 p.80(因子至少 3 个变量)。二者都只支持「题数太少不行」,不支持「恰好 3」。建议卡片把 3 标注为工程默认值而非文献阈值。
- 本批未使用中文期刊出处:D-16/17/19/20/21/22 全部找到英文 OA primary,无需回退到中文方法学综述。

#### D-09 ~ D-12 事后多重比较族

- 【D-09 规范性主张】未找到「农学/食品期刊或审稿人**要求/默认**用 Duncan」的可引用规范性文件。现有 OA 证据（Heliyon 2024 Table 1）只能支撑**描述性**事实（农业 32.68%、营养与食品安全 46.08% 为该学科使用最多的事后检验），不能支撑「审稿人要求」。已尝试：① ASA–CSSA–SSSA Publications Handbook and Style Manual Ch.5（agronomy.org 免费 PDF，已完整读取 4 页）——只规定字母标注惯例，且举例用的是 **Tukey's HSD**，未提 Duncan；② Crop Science 作者须知（sciencesocieties.org/publications/journals/author-resources/cs-instructions）——303 重定向到 SAML SSO 登录，无法开；③ 检索关键词 "Duncan's multiple range test" + "most widely used"/survey/agronomy/food science + open access、agricultural journals statistical practice survey。建议卡片文案把 D-09 的学科约束写成「学科**惯例**（使用频次实证）」而非「学科要求」。
- 【D-09 中文出处】未找到可打开的中文核心期刊方法学综述来支撑「农学默认 Duncan（邓肯氏新复极差法）」。已尝试关键词：农业试验 多重比较 邓肯氏新复极差法 Duncan 选用 方法学 综述 期刊。返回结果全部是 CSDN/知乎/博客园/百度百科等非学术源，无 CNKI/万方 OA 全文，也无 DOAJ 收录的中文统计学指南。CNKI 全文本身不可 WebFetch。
- 【D-09 经典批评文献】Chew, V. (1976). Uses and abuses of Duncan's multiple range test. Proc. Fla. State Hort. Soc. 89: 251–253 —— 这是最对口的园艺/农学领域 Duncan 批评文献，FLVC 期刊平台标称免费。但 https://journals.flvc.org/fshs/article/download/97827/93829/0 与 https://journals.flvc.org/fshs/article/view/97827 **两个 URL 均返回 HTTP 403**，无法取全文，故未采用（只有 Semantic Scholar 的题录，不构成「打开全文」）。
- 【D-11 最强候选未取到】Sauder, D. C., & DeMars, C. E. (2019). An updated recommendation for multiple comparisons. Advances in Methods and Practices in Psychological Science, 2(1), 26–44. https://doi.org/10.1177/2515245918808784 —— 这是**唯一**基于功效模拟直接论证「Games-Howell 应作默认」的现代文献，最适合当 D-11 primary。已尝试：SAGE HTML 页（socket closed）、SAGE /doi/full/（socket closed）、SAGE /doi/pdf/ 与 /doi/epub/（curl 返回 000，超时）、JMU 机构库 commons.lib.jmu.edu/gradpsych/77/（**只有题录+摘要，无 PDF**）、core.ac.uk / PsyArXiv / OSF 检索均无自存档副本。故 D-11 的 default=games_howell 目前靠 Heliyon 2024 §3.2 + Lee & Lee 2018 支撑，并**必须**带上 Juarros-Basterretxea 2024 的偏自由派 caveat。
- 【D-10 Tukey 本人可引替代】Tukey, J. W. (1991). The Philosophy of Multiple Comparisons. Statistical Science, 6(1), 100–116. DOI 10.1214/ss/1177011945 —— 曾设想用它替代未刊的 Tukey 1953。实测 Project Euclid 页面明确显示 “Full access may be available with your subscription” 并提供 $30 单篇购买，**不是 OA**，仅有摘要。故放弃，D-10 primary 改用 Midway et al. 2020（PeerJ, CC BY 4.0）。
- 【D-12 DSCF 缺专门 primary】未找到 Dwass–Steel–Critchlow–Fligner 的 OA primary。Critchlow & Fligner (1991, Communications in Statistics) 与 Neuhäuser (2001, Biometrical Journal, doi 10.1002/1521-4036(200109)43:5<571::AID-BIMJ571>3.0.CO;2-N) 均付费。目前 dscf 进入 allowed 集只靠 Heliyon 2024 §3.2 的列举句（“Non-parametric post-hoc tests include the Dunn, Steel, Nemenyi, and Steel-Dwass tests.”）+ 教科书 secondary（Hollander, Wolfe & Chicken 3rd ed., Ch.6）。若卡片正文要对 DSCF 作**性能**断言（如「比 Dunn 更有功效」），当前证据不足，建议不写或标注为软件文档口径。
- 【BH 原始文献】Benjamini, Y., & Hochberg, Y. (1995). JRSS-B 57(1): 289–300 —— 付费，未取全文。D-12 的「p 值按 BH 校正」改由两条 OA 支撑：Lee & Lee 2018（KJA, OA）的 FDR 节，与 Dinno 2015 自存档稿 §2.3/§5.2 的 bh 实现描述。

#### 分类资料族 D-13~D-15（2×2 列联表 / 期望频数规则 / 有序×二分趋势检验）

- **「N>40 / N≤40」这个总样本量阈值本身，找不到任何 OA（甚至找不到任何英文同行评议）primary。** 已试：Europe PMC 全文短语检索（"continuity correction was used when the total sample size"、"n < 40" AND "theoretical frequency"、"total sample size was less than 40" 等 6 组，命中的全部是应用型论文的 Methods 句子，不是方法学论证）；Unpaywall + OpenAlex 查 Cochran 1954 (10.2307/3001666) 与 Campbell 2007 (10.1002/sim.2832)，均 closed；中文检索命中《临床肝胆病杂志》官网一篇《四格表统计中该用Fisher确切概率法还是卡方检验》(https://www.lcgdbzz.org/custom/news/id/6809)，WebFetch 可开，原文有「如果总样本量大于40，最小理论频数大于5，就应该用卡方检验；如果总样本量大于40，最小理论频数介于1和5之间，就应该使用卡方检验的校正公式；如果总样本量小于40，或（注意这个或字）最小理论频数小于1，就应该用Fisher确切概率法。」——但该页面自标「来源：网络转载」，无作者/卷期/页码，**不是同行评议方法学文献，不可作 primary 引用**。结论：N>40 是中文教科书（孙振球《医学统计学》一系）的教学约定，只能作 secondary(print)；OA 侧唯一有模拟证据的总样本量锚点是 Campbell 2007 §3.1.1 的「N greater than 25」。建议把 tolerance 写成「N>40（教科书约定，较 Campbell 模拟所需的 N>25 更保守）」。
- **Nagel J, et al. Classical tests, linear models and their extensions for the analysis of 2 × 2 contingency tables. Methods in Ecology and Evolution. 2024;15(5). doi:10.1111/2041-210X.14318 —— 确认是 gold OA (CC BY-NC)，但本次取不到全文。** 已试：Wiley 期刊页 /doi/ 与 /doi/full/ 均 402 Payment Required；/doi/pdfdirect/ 返回 HTML 拦截页；DOAJ 条目页 403；St Andrews 机构库（hdl.handle.net/10023/29580，直链 bitstream 路径已定位为 `Nagel-2024-Classical-tests-linear-models-MEE-CCBYNC.pdf`）连续 3 次返回爱丁堡大学的 “Page unavailable” 故障页/超时；scholar.archive.org 无命中。这篇是 2024 年最直接的现代复核文献，**建议隔日重试 St Andrews 直链**，成功后可替换/补强 D-13 的 primary。
- **Lydersen S, Fagerland MW, Laake P. Recommended tests for association in 2×2 tables. Statistics in Medicine. 2009;28(7):1159–1175. doi:10.1002/sim.3531** —— Unpaywall/OpenAlex 均判 closed，无机构库副本（NTNU Open 检索无果）。网上流传的 aliquote.org/pub/3531_ftp.pdf 是第三方个人收藏的出版商 PDF，**非作者自存档，不计为 OA，未采用**。该文主张 Berger–Boos 修正的精确非条件检验为 2×2 的 gold standard，若日后拿到合法 OA 副本，可作为 D-14 「Fisher 过保守」这条注记的更强 primary。
- **D-15 缺一条「临床/流行病学口径」的 OA 方法学 primary 来陈述 CATT 的功效优势。** 现有两条 primary 中，Bewick 2004 给了「有序→做趋势检验」与 1 df 分解但没说 more powerful；Zheng 2009 说了 more powerful 但框架是遗传关联（GRR/基因型评分）。已试 Europe PMC：TITLE:"trend" AND TITLE:"proportions"、"chi-squared test for trend" AND OPEN_ACCESS:Y、J Toxicol Pathol / Toxicol Pathol / Regul Toxicol Pharmacol 的统计指南类检索，命中的全是应用文或遗传学/毒理学专用文献。Corcoran et al. "Power comparisons for tests of trend in dose-response studies" (Stat Med 2000) 正是要找的东西，但 Wiley 付费且无自存档。

---

## 七 · 对开工方案的回写清单

> 🔴 **本章是这次出处改写最重要的产出。** 它原本只是「换引文」的机械活,实际做下来
> **查出决策表里有若干默认值没有可辩护的一次文献支持** —— 而这是在写第一张方法卡**之前**发现的。
> 逐条给出:问题 → 证据 → 建议改法。改动落在 `BUILD-P0开工方案.md` §4.1.2 决策表与对应方法卡。

### 7.1 规则本身要改(不是出处问题)

| # | 规则 | 问题 | 建议 |
|---|---|---|---|
| **R1** | **D-17 的 fallback「建议 fisher」** | 🔴 **规则写错了。** 找不到任何文献(OA 或付费)主张「低 EPV 时改用 Fisher 精确检验」。文献的一致对策是 **Firth 惩罚似然**(van Smeden 2016 讨论段原文:"By applying Firth's correction…")。Fisher 精确检验解决的是**期望频数过小**,与 EPV 过低是两个不同的问题,被混在一起了 | fallback 改 `firth_logistic`(statsmodels 无原生实现 → 或降级为「精简自变量 + 显式披露」);**在 T2 写 logistic 卡之前改** |
| **R2** | **D-17 的 `EPV<5` 硬阈值** | 无 OA primary 主张「EPV<5 应拒绝拟合」。更麻烦的是所引 primary 的标题就是 **"No rationale for 1 variable per 10 events criterion"** —— 它是在**反对**把 EPV 当硬门槛的 | 从 `blocked`(硬拒)降为 `caveat`(照跑但强制在 Methods 段披露 EPV 与其不确定性);硬拒会把一个学界没有共识的门槛替用户做成决定 |
| **R3** | **D-08 的 `default = kruskal`** | 找不到任何 OA 一次文献主张「非正态时应优先 Kruskal-Wallis 而不是 Welch-ANOVA」。这是教科书惯例,不是有据可循的建议 | 两条路:①保留 default 但 `provenance` 如实标 `role: convention`(惯例)而非 `primary`;②改 default 为 `welch_anova`。**建议①**,理由见 R4 |
| **R4** | **D-06 的 `default = anova`** | 与本族最强的现代 OA 文献**公开冲突**:Delacre et al. 2019 主张即便方差看起来齐也默认用 Welch's F | **不改 default**(中文期刊惯例是真实约束),但 **Methods 段必须如实写明采用的是惯例口径**,并把 Delacre 2019 作为 `contested` 的另一派登记进 doctrine。这正是 §3.8「争议方法学承载形态」要处理的形状 |
| **R5** | **D-22 的 `KMO≥0.6`** | 没有 primary 把 0.6 定为准入门槛。可核对的事实链只到:Kaiser 1974 把 .60s 标为 **"mediocre"**、<.50 为 "unacceptable" | 阈值下调到 **0.50**(有出处的那条线)并把 0.60 作为 `caveat` 分界;或保留 0.6 但标 `role: convention` |
| **R6** | **D-21 的「量表 ≥3 题」** | 没有任何文献给出 3 这个数字作为算 α 的硬门槛 | 标 `role: convention`,或改为「题数过少时 α 失真」的 caveat(Tavakol & Dennick 2011 p.54 有可引原文) |
| **R7** | **D-14 的「N>40」** | 找不到任何 OA、甚至任何英文同行评议的 primary 支撑这个总样本量阈值 | 标 `role: convention`;真正有出处的是**期望频数**判据,把分流条件收敛到期望频数上 |

### 7.2 出处口径要改

| # | 内容 | 说明 |
|---|---|---|
| **R8** | **D-09「农学/食品审稿人要求 Duncan」** | 现有证据只支撑**描述性**事实(Heliyon 2024 Table 1:农业 32.68%、营养与食品安全 46.08% 为该学科使用最多的事后检验),**不支撑「审稿人要求」**这个规范性主张。policy 包里的措辞必须相应改成「该学科最常用」而非「审稿人默认要求」——否则是拿描述当规范 |
| **R9** | **`provenance.role` 需要第三档** | 现 schema 只有 `primary` / `secondary`。R3/R5/R6/R7 揭示存在第三类:**有惯例、无一次文献**。建议加 `role: convention`,并让 `doctor` 对 `convention` 作 default 依据的规则**强制要求 Methods 段披露**「本默认依学科惯例而非文献建议」 |
| **R10** | **§3.2 的可及性分布表已过期** | 原表估「OA 4–5 条 / 付费 5–6 / 纸质 ~7 / 未刊 1」。实际改写后 **22 条规则全部拿到 OA 或 free_to_read 的 primary**(见 §〇)。该表连同「2/3 规则会原地 escalate」的预期一并作废 |
| **R11** | **V8b 的 escalate 阈值 `≤6/22`** | 原为拍脑袋。按实测重定:22 条规则的 primary 全部可及,故阈值应显著收紧。但注意 R1–R7 那 7 条会因**规则本身**(非出处)进入 `contested`/`convention`,应与 escalate 分开计数 |
| **R12** | **doctor V0-⑥ 的判据** | 原判据「每条规则至少一条 `role: primary` 且 `access ∈ {oa, local_pdf}`」现在**可以真的全绿**。但要加一条:`access: free_to_read` 不等于 `oa`(D-22 的 Watkins 2018 是课程站/作者站镜像,不是出版社 OA),schema 要能区分,别把两者抹平 |

### 7.3 过程教训(写进评审 agent 的 skill)

1. **取全文这一步本身会引入幻觉。** 回核员实测记录:`WebFetch` 的摘要模型把一段引文**改写**后返回,首轮找源员据此写进了 `quote`。⇒ 评审 agent 的 skill 必须规定:引文摘录只能来自**原始字节**(PDF 文本层 / XML 全文接口),不能来自任何摘要环节。
2. **双栏 PDF 用 `pdftotext -layout` 会漏命中。** 同一份 Blanca 2017,加 `-layout` 检索不到、去掉才完整命中。skill 要写明两种都试。
3. **最常见的失败不是「查不到」,是「查到了但方向相反」。** 14 条存疑里占比最高的一类就是它(D-08 Blanca、D-14 Campbell、D-12 Conover & Iman 都是)。⇒ 回核的第三问(「真的支持吗」)不能省,它比前两问更容易出事。
4. **引到参考文献表里的一行**(D-10 Juarros 2024)与**跨段拼接**(D-10 Midway、D-11 Juarros)各出现两次。⇒ skill 要求 `locator` 精确到节/页,并由回核员复核该 locator 指向的是**论断**而非著录。
