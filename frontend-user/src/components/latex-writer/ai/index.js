/**
 * ============================================================================
 * Scholay学术 V1.0
 * LaTeX AI 模块导出
 * ============================================================================
 */

// 新版 Agent Core（事件驱动、支持 Function Calling）
export { 
  default as AgentCore, 
  AgentState, 
  AgentEvent, 
  createAgent 
} from './AgentCore';

// 工具管理器
export { 
  default as ToolManager, 
  toolManager, 
  ToolCategory, 
  ToolCategoryNames 
} from './ToolManager';

// 旧版 Agent（保持向后兼容）
export { default as LatexAiAgent, latexAiAgent, LATEX_PROMPTS } from './LatexAiAgent';

// 命令系统
export { default as LatexCommands, LATEX_COMMANDS, QUICK_COMMANDS, ADVANCED_COMMANDS } from './LatexCommands';

// 提示词模板
export { TASK_PROMPTS, SECTION_PROMPTS, SYSTEM_PROMPTS } from './LatexPrompts';

// Diff 组件
export { default as DiffViewer, InlineDiff } from './DiffViewer';

// Chat 组件
export { default as LatexAiChat } from './LatexAiChat';

// 工具类
export { default as SmoothAppender } from './SmoothAppender';
export { default as StreamHandler } from './StreamHandler';

// 消息解析器
export { 
  parseAiMessage, 
  parseStreamingMessage, 
  isLatexCode, 
  cleanLatexCode 
} from './MessageParser';
