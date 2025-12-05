/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

// 任务状态映射
export const STATUS_MAP = {
  draft: { label: '草稿', color: 'gray' },
  pending: { label: '等待处理', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

// 视图模式
export const VIEW_MODE = {
  HOME: 'home',       // 主页（创建+列表）
  DETAIL: 'detail',   // 任务详情
};

// 允许的文件类型
export const ALLOWED_FILE_TYPES = ['.txt', '.doc', '.docx', '.rtf', '.odt', '.pdf', '.xml', '.html', '.htm'];

// 允许的附件文件类型
export const ALLOWED_ATTACHMENT_TYPES = [
  '.txt', '.doc', '.docx', '.rtf', '.odt', '.pdf', '.xml', '.html', '.htm',
  '.xlsx', '.xls', '.csv', '.epub',
  '.py', '.js', '.ts', '.go', '.java', '.c', '.cpp', '.h', '.rs', '.rb', '.php',
  '.sql', '.json', '.yaml', '.yml', '.md', '.r'
];

// 最大文件大小 (5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 最大附件数量
export const MAX_ATTACHMENTS = 5;

// 最大字符数
export const MAX_CHAR_COUNT = 50000;
