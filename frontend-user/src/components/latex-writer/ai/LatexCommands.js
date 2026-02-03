/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX AI 命令定义
 * 定义所有可用的 AI 操作命令
 */

import { TASK_PROMPTS, SECTION_PROMPTS } from './LatexPrompts';

/**
 * 命令图标 SVG
 */
const ICONS = {
  continue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  polish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  translate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  fix: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  explain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  shorten: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H3M21 6H3M21 14H3M21 18H3"/><path d="M7 10l-4 4 4 4"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H3M21 6H3M21 14H3M21 18H3"/><path d="M17 10l4 4-4 4"/></svg>',
  abstract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  reference: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  formula: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16M4 8h16M4 12h8M4 16h10M4 20h12"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  section: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
};

/**
 * 快捷命令列表（用于工具栏和快捷键）
 */
export const QUICK_COMMANDS = [
  {
    id: 'continue_writing',
    name: '续写',
    shortcut: 'Alt+C',
    icon: ICONS.continue,
    taskType: 'continue_writing',
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'polish',
    name: '润色',
    shortcut: 'Alt+P',
    icon: ICONS.polish,
    taskType: 'polish',
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'translate_to_english',
    name: '翻译成英文',
    shortcut: 'Alt+T',
    icon: ICONS.translate,
    taskType: 'translate',
    variables: { language: '英文' },
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'translate_to_chinese',
    name: '翻译成中文',
    icon: ICONS.translate,
    taskType: 'translate',
    variables: { language: '中文' },
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'fix_errors',
    name: '修复错误',
    shortcut: 'Alt+F',
    icon: ICONS.fix,
    taskType: 'fix_errors',
    requiresSelection: true,
    modelLevel: 'low',
  },
  {
    id: 'explain',
    name: '解释代码',
    shortcut: 'Alt+E',
    icon: ICONS.explain,
    taskType: 'explain',
    requiresSelection: true,
    modelLevel: 'low',
  },
];

/**
 * 高级命令列表（用于菜单）
 */
export const ADVANCED_COMMANDS = [
  {
    id: 'shorten',
    name: '精简内容',
    icon: ICONS.shorten,
    taskType: 'shorten',
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'expand',
    name: '扩展内容',
    icon: ICONS.expand,
    taskType: 'expand',
    requiresSelection: true,
    modelLevel: 'mid',
  },
  {
    id: 'generate_abstract',
    name: '生成摘要',
    icon: ICONS.abstract,
    taskType: 'generate_abstract',
    requiresSelection: true,
    modelLevel: 'high',
  },
  {
    id: 'generate_outline',
    name: '生成大纲',
    icon: ICONS.outline,
    taskType: 'generate_outline',
    requiresSelection: false,
    modelLevel: 'high',
  },
  {
    id: 'format_references',
    name: '格式化引用',
    icon: ICONS.reference,
    taskType: 'format_references',
    requiresSelection: true,
    modelLevel: 'low',
  },
  {
    id: 'generate_formula',
    name: '生成公式',
    icon: ICONS.formula,
    taskType: 'generate_formula',
    requiresSelection: false,
    modelLevel: 'mid',
  },
  {
    id: 'generate_table',
    name: '生成表格',
    icon: ICONS.table,
    taskType: 'generate_table',
    requiresSelection: false,
    modelLevel: 'mid',
  },
];

/**
 * 章节写作命令
 */
export const SECTION_COMMANDS = Object.keys(SECTION_PROMPTS).map(key => ({
  id: `section_${key}`,
  name: `写${SECTION_PROMPTS[key].name}`,
  icon: ICONS.section,
  sectionType: key,
  requiresSelection: false,
  modelLevel: 'high',
}));

/**
 * 所有命令的集合
 */
export const LATEX_COMMANDS = {
  quick: QUICK_COMMANDS,
  advanced: ADVANCED_COMMANDS,
  sections: SECTION_COMMANDS,
};

/**
 * 命令管理类
 */
export class LatexCommands {
  /**
   * 获取所有快捷命令
   */
  static getQuickCommands() {
    return QUICK_COMMANDS;
  }

  /**
   * 获取所有高级命令
   */
  static getAdvancedCommands() {
    return ADVANCED_COMMANDS;
  }

  /**
   * 获取所有章节命令
   */
  static getSectionCommands() {
    return SECTION_COMMANDS;
  }

  /**
   * 根据 ID 获取命令
   * @param {string} commandId 
   */
  static getCommand(commandId) {
    const allCommands = [
      ...QUICK_COMMANDS,
      ...ADVANCED_COMMANDS,
      ...SECTION_COMMANDS,
    ];
    return allCommands.find(cmd => cmd.id === commandId);
  }

  /**
   * 获取命令的图标
   * @param {string} iconName 
   */
  static getIcon(iconName) {
    return ICONS[iconName] || '';
  }

  /**
   * 检查命令是否需要选中文本
   * @param {string} commandId 
   */
  static requiresSelection(commandId) {
    const command = this.getCommand(commandId);
    return command?.requiresSelection ?? false;
  }

  /**
   * 获取命令推荐的模型级别
   * @param {string} commandId 
   */
  static getModelLevel(commandId) {
    const command = this.getCommand(commandId);
    return command?.modelLevel || 'mid';
  }
}

export default LatexCommands;
