/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Tool Manager - MCP 工具管理器
 * 
 * 负责：
 * 1. 从后端加载工具定义
 * 2. 工具分类和筛选
 * 3. 工具调用封装
 * 4. 工具结果缓存
 */

import { latexApi as userAPI } from 'features/latex-writer/api/latexApi';

/**
 * 工具分类
 */
export const ToolCategory = {
  LATEX: 'latex',
  SEARCH: 'search',
  BIBTEX: 'bibtex',
  FILE: 'file',
  CONVERT: 'convert',
  MATH: 'math',
  IMAGE: 'image',
  CODE: 'code',
  TEMPLATE: 'template',
};

/**
 * 工具分类显示名称
 */
export const ToolCategoryNames = {
  [ToolCategory.LATEX]: 'LaTeX 工具',
  [ToolCategory.SEARCH]: '论文搜索',
  [ToolCategory.BIBTEX]: '参考文献',
  [ToolCategory.FILE]: '文件操作',
  [ToolCategory.CONVERT]: '格式转换',
  [ToolCategory.MATH]: '数学工具',
  [ToolCategory.IMAGE]: '图片工具',
  [ToolCategory.CODE]: '代码执行',
  [ToolCategory.TEMPLATE]: '模板工具',
};

/**
 * Tool Manager 类
 */
class ToolManager {
  constructor() {
    this.tools = new Map();
    this.toolsByCategory = new Map();
    this.loaded = false;
    this.loading = false;
    this.lastLoadTime = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 分钟缓存
  }

  /**
   * 加载工具列表
   */
  async loadTools(force = false) {
    // 检查缓存
    if (!force && this.loaded && this.lastLoadTime) {
      const elapsed = Date.now() - this.lastLoadTime;
      if (elapsed < this.cacheTimeout) {
        return this.getAllTools();
      }
    }

    // 防止并发加载
    if (this.loading) {
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (!this.loading) {
            clearInterval(checkLoaded);
            resolve(this.getAllTools());
          }
        }, 100);
      });
    }

    this.loading = true;

    try {
      const response = await userAPI.getMCPTools();
      
      if (response.data?.tools) {
        this.tools.clear();
        this.toolsByCategory.clear();

        response.data.tools.forEach(tool => {
          this.tools.set(tool.name, tool);

          // 按分类组织
          const category = tool.category || 'other';
          if (!this.toolsByCategory.has(category)) {
            this.toolsByCategory.set(category, []);
          }
          this.toolsByCategory.get(category).push(tool);
        });

        this.loaded = true;
        this.lastLoadTime = Date.now();

      }

      return this.getAllTools();
    } catch (error) {
      console.error('[ToolManager] Failed to load tools:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * 获取所有工具
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * 按分类获取工具
   */
  getToolsByCategory(category) {
    return this.toolsByCategory.get(category) || [];
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Array.from(this.toolsByCategory.keys());
  }

  /**
   * 调用工具
   */
  async callTool(name, args = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      const response = await userAPI.callMCPTool(name, args);
      
      if (response.data?.success === false) {
        throw new Error(response.data.error || 'Tool call failed');
      }

      return response.data;
    } catch (error) {
      console.error(`[ToolManager] Tool ${name} failed:`, error);
      throw error;
    }
  }

  /**
   * 批量调用工具
   */
  async batchCallTools(calls) {
    try {
      const response = await userAPI.batchCallMCPTools(calls);
      return response.data?.results || [];
    } catch (error) {
      console.error('[ToolManager] Batch call failed:', error);
      throw error;
    }
  }

  /**
   * 获取 LLM 格式的工具列表
   */
  getToolsForLLM() {
    return this.getAllTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * 搜索工具
   */
  searchTools(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAllTools().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 获取推荐工具（基于上下文）
   */
  getRecommendedTools(context = {}) {
    const recommended = [];

    // 如果有 LaTeX 内容，推荐 LaTeX 工具
    if (context.hasLatexContent) {
      recommended.push(...this.getToolsByCategory(ToolCategory.LATEX));
    }

    // 如果提到论文搜索相关词汇
    if (context.mentionsSearch || context.mentionsPapers) {
      recommended.push(...this.getToolsByCategory(ToolCategory.SEARCH));
    }

    // 如果提到引用或参考文献
    if (context.mentionsReferences) {
      recommended.push(...this.getToolsByCategory(ToolCategory.BIBTEX));
    }

    return recommended;
  }

  /**
   * 验证工具参数
   */
  validateToolArgs(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, error: `Tool not found: ${name}` };
    }

    const schema = tool.inputSchema;
    if (!schema) {
      return { valid: true };
    }

    // 检查必要参数
    const required = schema.required || [];
    for (const param of required) {
      if (!(param in args)) {
        return { valid: false, error: `Missing required parameter: ${param}` };
      }
    }

    return { valid: true };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.tools.clear();
    this.toolsByCategory.clear();
    this.loaded = false;
    this.lastLoadTime = null;
  }
}

// 导出单例
export const toolManager = new ToolManager();

// 默认导出类
export default ToolManager;
