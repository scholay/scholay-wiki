import {
  MathDialog,
  NumbersDialog,
  PRISM_MOCK_THEME,
  RevisionDialog,
  TranslateDialog,
  WritingProfileDialog,
} from "./WikiEmbedPrismSurfaces";

/**
 * PrismLivePreview 在 AI 写入 document.md 后显示的整篇只读文章面。
 * 内容冻结在一次完整、安全的流式刷新；正文引用与文末编号保持同源。
 */
export function WikiEmbedPrismLivePreview() {
  return (
    <div
      className="relative h-[34rem] w-[min(100%,45rem)] overflow-y-auto bg-background"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-live-preview"
    >
      <div className="mx-auto max-w-reading px-12 py-10 font-serif text-14 text-foreground">
        <p className="text-center text-24 font-medium">
          生成式模型医学影像重建的外部验证
        </p>

        <div className="mx-auto mt-6 max-w-[86%]">
          <p className="mb-1 text-center text-12 font-medium">摘要</p>
          <p className="indent-8 text-justify text-12 leading-paragraph">
            本研究在三个独立中心评估扩散模型的医学影像重建表现，并比较统一预处理下的图像质量、稳定性与外部泛化能力。
          </p>
        </div>

        <p className="mx-auto mt-2 max-w-[86%] text-12">
          <span className="font-medium">关键词:</span>{" "}
          扩散模型；医学影像；外部验证
        </p>

        <div className="mt-8 text-14 leading-paragraph">
          <h1 className="mb-2 mt-3 text-16 font-medium text-foreground first:mt-0">
            1 引言
          </h1>
          <p className="mb-[var(--wiki-mock-space-10)] text-foreground">
            生成式重建正在进入多中心验证阶段。既往研究显示，扩散模型能够改善低剂量扫描的结构保真度
            [1]，但跨设备泛化仍需独立检验 [2]。
          </p>

          <h2 className="mb-2 mt-3 text-14 font-medium text-foreground">
            2 方法
          </h2>
          <p className="mb-[var(--wiki-mock-space-10)] text-foreground">
            我们纳入 1,240 例 MRI 扫描，固定训练集划分，并在外部中心报告
            PSNR、SSIM 与盲评结果。所有比较沿用同一预处理和统计方案。
          </p>

          <h2 className="mb-2 mt-3 text-14 font-medium text-foreground">
            3 结果
          </h2>
          <p className="text-foreground">
            扩散模型在三个中心均提高结构相似度，同时保留病灶边界；外部中心的效应幅度低于内部测试集，提示仍需持续校准。
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-reading px-12 pb-12 font-serif text-14 text-foreground">
        <h2 className="mb-3 border-b border-border pb-1 text-16 font-medium">
          参考文献
        </h2>
        <ol className="space-y-2">
          <li className="flex gap-2 text-12 leading-paragraph text-subtle">
            <span className="shrink-0 tabular-nums text-faint">[1]</span>
            <span className="min-w-0">
              Ho J, Jain A, Abbeel P.{" "}
              <span className="text-foreground">
                Denoising Diffusion Probabilistic Models.{" "}
              </span>
              <span className="italic">NeurIPS. </span>2020.
            </span>
          </li>
          <li className="flex gap-2 text-12 leading-paragraph text-subtle">
            <span className="shrink-0 tabular-nums text-faint">[2]</span>
            <span className="min-w-0">
              Willemink M et al.{" "}
              <span className="text-foreground">
                Preparing Medical Imaging Data for Machine Learning.{" "}
              </span>
              <span className="italic">Radiology. </span>2020.
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}

/** PrismWritingProfileDialog 的「生物医学实证 · 当前使用」单态。 */
export function WikiEmbedPrismWritingProfileDialog() {
  return (
    <div
      className="flex w-[min(100%,48rem)] items-start justify-center bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-writing-profile-dialog"
    >
      <WritingProfileDialog />
    </div>
  );
}

/** PrismRevisionDialog 拆条完成后的逐条回应单态。 */
export function WikiEmbedPrismRevisionDialog() {
  return (
    <div
      className="flex w-[min(100%,44rem)] items-start justify-center bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-revision-dialog"
    >
      <RevisionDialog />
    </div>
  );
}

/** PrismTranslateDialog 的两遍翻译纪律与术语表单态。 */
export function WikiEmbedPrismTranslateDialog() {
  return (
    <div
      className="flex w-[min(100%,34rem)] items-start justify-center bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-translate-dialog"
    >
      <TranslateDialog />
    </div>
  );
}

/** PrismNumbersDialog 完成一次校验并发现一个异常数字的单态。 */
export function WikiEmbedPrismNumbersDialog() {
  return (
    <div
      className="flex w-[min(100%,34rem)] items-start justify-center bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-numbers-dialog"
    >
      <NumbersDialog />
    </div>
  );
}

/** MathEditorDialog 输入公式后、插入前的单态。 */
export function WikiEmbedPrismMathEditorDialog() {
  return (
    <div
      className="flex w-[min(100%,34rem)] items-start justify-center bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-math-editor-dialog"
    >
      <MathDialog />
    </div>
  );
}
