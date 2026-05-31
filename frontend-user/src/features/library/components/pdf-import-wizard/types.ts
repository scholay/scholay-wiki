import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';

export type ParsingPhase = 'uploading' | 'parsed' | 'searching' | 'done';

// 填写阶段的字段集合统一用 hooks/useMetadataForm 的 MetadataFormValues(原 FillFormFields 已下线)。

export type WizardStep =
  | { kind: 'upload' }
  | { kind: 'parsing'; file: File; phase: ParsingPhase }
  | {
      kind: 'decide';
      file: File;
      parsed: ParsedEvent | null;
      searchHits: SearchHit[];
      jobId: string;
    }
  | {
      kind: 'fill';
      file: File;
      parsed: ParsedEvent | null;
      jobId: string;
      /** 选了上游候选 → 完整 SearchHit;手动填写 → null */
      sourceHit: SearchHit | null;
    };
