export const FILE_UPLOAD = {
  MAX_FILES: 10,
  MAX_IMAGES: 10,
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  ACCEPTED_FILE_TYPES: ['.pdf', '.doc', '.docx', '.txt'],
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
} as const;

export const LAYOUT = {
  PREVIEW_MIN_WIDTH: 320,
  PREVIEW_MAX_WIDTH: 800,
  SIDEBAR_WIDTH: 280,
  SIDEBAR_COLLAPSED_WIDTH: 64,
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [20, 50, 100, 200],
  MAX_VISIBLE_PAGES: 5,
} as const;

export const API = {
  CONCURRENCY_LIMIT: 5,
  REQUEST_TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
} as const;

export const PAPER = {
  FIELDS: [
    'paperId',
    'title',
    'abstract',
    'authors',
    'year',
    'citationCount',
    'url',
    'venue',
    'publicationDate',
    'openAccessPdf',
    'fieldsOfStudy',
    'isOpenAccess',
    'referenceCount',
    'influentialCitationCount',
    'tldr',
    'journal',
    'externalIds',
  ],
  ABSTRACT_TRUNCATE_LENGTH: 100,
  ABSTRACT_BUFFER_LENGTH: 120,
  MAX_AUTHORS_DISPLAY: 4,
  MAX_FIELDS_DISPLAY: 2,
} as const;

export interface FieldOfStudy {
  key: string;
  label: string;
}

export const FIELDS_OF_STUDY: FieldOfStudy[] = [
  { key: 'Computer Science', label: '计算机科学' },
  { key: 'Medicine', label: '医学' },
  { key: 'Biology', label: '生物学' },
  { key: 'Chemistry', label: '化学' },
  { key: 'Physics', label: '物理学' },
  { key: 'Mathematics', label: '数学' },
  { key: 'Engineering', label: '工程学' },
  { key: 'Materials Science', label: '材料科学' },
  { key: 'Economics', label: '经济学' },
  { key: 'Psychology', label: '心理学' },
  { key: 'Sociology', label: '社会学' },
  { key: 'Political Science', label: '政治学' },
  { key: 'Business', label: '商业' },
  { key: 'Environmental Science', label: '环境科学' },
  { key: 'Geography', label: '地理学' },
  { key: 'History', label: '历史学' },
  { key: 'Philosophy', label: '哲学' },
  { key: 'Art', label: '艺术' },
];

export interface CitationOption {
  value: string;
  label: string;
}

export const CITATION_OPTIONS: CitationOption[] = [
  { value: '', label: '引用次数不限' },
  { value: '10', label: '≥10' },
  { value: '50', label: '≥50' },
  { value: '100', label: '≥100' },
  { value: '500', label: '≥500' },
];

export const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return [
    { value: '', label: '时间不限' },
    { value: String(currentYear), label: `${currentYear}年至今` },
    { value: String(currentYear - 1), label: `${currentYear - 1}年至今` },
    { value: String(currentYear - 4), label: `${currentYear - 4}年至今` },
  ];
};

export const AI_MODEL = {
  LEVELS: { LOW: 'low', MID: 'mid', HIGH: 'high' },
  LEVEL_NAMES: { low: '普通模型', mid: '高级模型', high: '旗舰模型' } as Record<string, string>,
} as const;

export const STORAGE_KEYS = {
  USER_TOKEN: 'user_token',
  USER_DATA: 'user_data',
  SEARCH_QUERY: 'search_query',
  SEARCH_FILTERS: 'search_filters',
  SEARCH_MODE: 'search_mode',
  AI_MODEL_LEVEL: 'ai_model_level',
  AI_CONVERSATION_ID: 'ai_conversation_id',
  PAPERS_PER_PAGE: 'papersPerPage',
  THEME: 'theme',
} as const;

export const ROUTES = {
  HOME: '/',
  SEARCH_RESULTS: '/search-results',
  PAPER_DETAIL: '/paper/:paperId',
  CHAT: '/chat',
  PEER_REVIEW: '/peer-review',
  ASSISTANT: '/assistant',
  SETTINGS: '/settings',
  PRICING: '/pricing',
  ABOUT: '/about',
  FEEDBACK: '/feedback',
} as const;

export const EVENTS = {
  AUTH_REQUIRED: 'auth:required',
  AUTH_EXPIRED: 'auth:expired',
  THEME_CHANGE: 'theme:change',
} as const;
