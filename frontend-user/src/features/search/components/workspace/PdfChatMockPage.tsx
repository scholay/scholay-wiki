import { cn } from '@/shared/lib/utils';
import type { Paper } from '../../api/papers';

/** 单页 PDF 样式示例 —— 纯静态 mock,不加载真实 PDF */
export function PdfChatMockPage({ paper }: { paper?: Paper | null }) {
  const title =
    paper?.title?.trim() || 'Attention Is All You Need';
  const authors =
    paper?.authors?.map((a) => a.name).filter(Boolean).slice(0, 4).join(', ') ||
    'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit';
  const venue = paper?.venue?.trim() || 'NeurIPS 2017';
  const year = paper?.year ?? 2017;

  return (
    <div className="mx-auto w-full max-w-[680px] bg-white text-[#1a1a1a] shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
      <div className="border-b border-[#e8e8e8] px-10 py-8 text-center">
        <h1 className="font-display text-[22px] font-bold leading-snug tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[#444]">{authors}</p>
        <p className="mt-1 text-[11px] text-[#777]">
          {venue} · {year}
        </p>
      </div>

      <div className="space-y-5 px-10 py-8 text-[11px] leading-[1.75] text-[#333]">
        <section>
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#555]">
            Abstract
          </h2>
          <p>
            The dominant sequence transduction models are based on complex recurrent or
            convolutional neural networks that include an encoder and a decoder. The best
            performing models also connect the encoder and decoder through an attention
            mechanism. We propose a new simple network architecture, the Transformer,
            based solely on attention mechanisms, dispensing with recurrence and
            convolutions entirely.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            {MOCK_PARAS.slice(0, 3).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="space-y-2">
            {MOCK_PARAS.slice(3, 6).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        <figure className="rounded-sm border border-[#e8e8e8] bg-[#fafafa] p-4">
          <div className="mb-2 text-center text-[10px] font-semibold text-[#666]">
            Figure 1 — Model Architecture
          </div>
          <div className="flex items-center justify-center gap-3 py-6">
            <MockBox label="Input" />
            <MockArrow />
            <MockBox label="Encoder" highlight />
            <MockArrow />
            <MockBox label="Decoder" highlight />
            <MockArrow />
            <MockBox label="Output" />
          </div>
        </figure>

        <section className="space-y-2">
          {MOCK_PARAS.slice(6, 8).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      </div>

      <div className="border-t border-[#eee] px-10 py-3 text-center text-[10px] text-[#999]">
        Page 1 of 12
      </div>
    </div>
  );
}

const MOCK_PARAS = [
  'Experiments on two machine translation tasks show that these models are superior in quality while being more parallelizable and requiring significantly less time to train.',
  'Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.',
  'On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs.',
  'We show that the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing with large amounts of training data.',
  'Attention mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks, allowing modeling of dependencies without regard to their distance in the input or output sequences.',
  'Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence.',
  'To evaluate the importance of different components of the Transformer, we varied our base model in different ways, measuring the change in performance on English-to-German translation.',
  'We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs.',
];

function MockBox({
  label,
  highlight,
}: {
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-sm border px-3 py-2 text-[10px] font-semibold',
        highlight
          ? 'border-brand-red/40 bg-brand-red/5 text-brand-red'
          : 'border-[#ddd] bg-white text-[#666]',
      )}
    >
      {label}
    </div>
  );
}

function MockArrow() {
  return <span className="text-[#ccc]">→</span>;
}
