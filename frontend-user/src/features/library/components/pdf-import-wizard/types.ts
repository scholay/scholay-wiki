import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';

export type ParsingPhase = 'uploading' | 'parsed' | 'searching' | 'done';

export type WizardStep =
  | { kind: 'upload' }
  | { kind: 'parsing'; file: File; phase: ParsingPhase }
  | {
      kind: 'decide';
      file: File;
      parsed: ParsedEvent | null;
      searchHits: SearchHit[];
      jobId: string;
    };
