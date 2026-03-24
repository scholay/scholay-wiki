/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 编译器 - 基于 SwiftLaTeX WASM
 * 支持 pdfTeX 和 XeTeX 两种引擎
 */

// 使用绝对路径
const BASE_PATH = '/core/swiftlatex';

// 全局引擎实例
let pdfTeXEngine = null;
let xeTeXEngine = null;
let currentEngine = 'pdftex'; // pdftex 或 xetex
let engineStatus = 'unloaded'; // unloaded, loading, ready, compiling, error

// 状态监听器
const statusListeners = new Set();

// 注册 TexLive 缓存 Service Worker
const registerTexLiveCacheSW = async () => {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/texlive-cache-sw.js', {
        scope: '/'
      });
    } catch (error) {
      console.warn('[LatexCompiler] Service Worker registration failed:', error);
    }
  }
};

// 立即尝试注册
registerTexLiveCacheSW();

// 加载脚本
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    // 检查脚本是否已加载
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

// 通知状态变化
const notifyStatusChange = () => {
  statusListeners.forEach(listener => listener(engineStatus));
};

// 设置状态
const setStatus = (status) => {
  engineStatus = status;
  notifyStatusChange();
};

// 添加状态监听器
export const addStatusListener = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

// 获取当前状态
export const getStatus = () => engineStatus;

// 获取当前引擎类型
export const getCurrentEngineType = () => currentEngine;

// 设置引擎类型
export const setEngineType = (type) => {
  if (type === 'pdftex' || type === 'xetex') {
    currentEngine = type;
  }
};

// 初始化引擎
export const initializeEngine = async (engineType = null) => {
  // 如果指定了引擎类型，更新当前引擎
  if (engineType) {
    currentEngine = engineType;
  }

  if (engineStatus === 'ready') return true;
  if (engineStatus === 'loading') {
    // 等待加载完成
    return new Promise((resolve) => {
      const checkStatus = () => {
        if (engineStatus === 'ready') {
          resolve(true);
        } else if (engineStatus === 'error') {
          resolve(false);
        } else {
          setTimeout(checkStatus, 100);
        }
      };
      checkStatus();
    });
  }

  setStatus('loading');

  try {
    // 使用本站 Nginx 代理获取 TexLive 资源，启用浏览器 disk cache
    const texliveEndpoint = `${window.location.origin}/texlive-proxy/`;

    if (currentEngine === 'xetex') {
      // 设置引擎路径
      window.ENGINE_PATH = `${BASE_PATH}/texlyrexetex.js`;
      
      // 加载 XeTeXEngine 脚本
      await loadScript(`${BASE_PATH}/XeTeXEngine.js`);

      // 等待引擎类可用
      let attempts = 0;
      while (typeof window.XeTeXEngine !== 'function' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (typeof window.XeTeXEngine !== 'function') {
        throw new Error('XeTeXEngine not available after loading scripts');
      }

      // 创建引擎实例
      xeTeXEngine = new window.XeTeXEngine();
      await xeTeXEngine.loadEngine();
      xeTeXEngine.setTexliveEndpoint(texliveEndpoint);
    } else {
      // 设置引擎路径（供 PdfTeXEngine.js 使用）
      window.ENGINE_PATH = `${BASE_PATH}/texlyrepdftex.js`;
      
      // 加载 PdfTeXEngine 脚本
      await loadScript(`${BASE_PATH}/PdfTeXEngine.js`);

      // 等待引擎类可用
      let attempts = 0;
      while (typeof window.PdfTeXEngine !== 'function' && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (typeof window.PdfTeXEngine !== 'function') {
        throw new Error('PdfTeXEngine not available after loading scripts');
      }

      // 创建引擎实例
      pdfTeXEngine = new window.PdfTeXEngine();
      await pdfTeXEngine.loadEngine();
      pdfTeXEngine.setTexliveEndpoint(texliveEndpoint);
    }

    setStatus('ready');
    return true;
  } catch (error) {
    console.error('[LatexCompiler] Failed to initialize engine:', error);
    setStatus('error');
    return false;
  }
};

// 检测内容是否包含中文
const containsChinese = (content) => {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(content);
};

// 检测是否使用了需要 XeTeX 的宏包
const requiresXeTeX = (content) => {
  return content.includes('\\usepackage{ctex}') ||
         content.includes('\\usepackage{xeCJK}') ||
         content.includes('\\documentclass{ctexart}') ||
         content.includes('\\documentclass{ctexbook}') ||
         content.includes('\\documentclass{ctexrep}') ||
         content.includes('\\usepackage{fontspec}');
};

// 编译 LaTeX
export const compileLaTeX = async (content, mainFileName = 'main.tex', options = {}) => {
  // 自动检测是否需要 XeTeX
  const needXeTeX = options.forceXeTeX || requiresXeTeX(content) || (options.autoChinese && containsChinese(content));
  
  if (needXeTeX && currentEngine !== 'xetex') {
    // 需要重新初始化 XeTeX 引擎
    engineStatus = 'unloaded';
    currentEngine = 'xetex';
    xeTeXEngine = null;
  }

  // 确保引擎已初始化
  if (engineStatus !== 'ready') {
    const initialized = await initializeEngine();
    if (!initialized) {
      throw new Error('编译引擎初始化失败，请刷新页面重试');
    }
  }

  // 获取当前使用的引擎
  const engine = currentEngine === 'xetex' ? xeTeXEngine : pdfTeXEngine;
  
  if (!engine) {
    throw new Error(`编译引擎未初始化 (${currentEngine})`);
  }

  setStatus('compiling');

  try {
    // 写入文件到虚拟文件系统（必须使用 /work/ 前缀）
    // 注意：不要调用 flushCache()，否则会清除已缓存的宏包
    const workPath = `/work/${mainFileName}`;
    engine.writeMemFSFile(workPath, content);
    engine.setEngineMainFile(mainFileName);

    // 等待 Worker 处理消息（确保文件写入完成）
    await new Promise(resolve => setTimeout(resolve, 100));

    // 编译（运行三次以处理引用和目录）
    const result1 = await engine.compileLaTeX();
    const result2 = await engine.compileLaTeX();
    const result = await engine.compileLaTeX();

    setStatus('ready');

    if (result.pdf) {
      // 创建 Blob URL
      const blob = new Blob([result.pdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      return {
        success: true,
        pdfUrl: url,
        log: result.log,
        engine: currentEngine
      };
    } else {
      return {
        success: false,
        error: parseCompileError(result.log, currentEngine),
        log: result.log,
        engine: currentEngine
      };
    }
  } catch (error) {
    setStatus('ready');
    console.error('[LatexCompiler] Compilation error:', error);
    throw error;
  }
};

// 解析编译错误
const parseCompileError = (log, engineType = 'pdftex') => {
  if (!log) return '编译失败，未知错误';
  
  // 检查是否是 TexLive 服务器不可用的错误
  const fmtFile = engineType === 'xetex' ? 'swiftlatexxetex.fmt' : 'swiftlatexpdftex.fmt';
  if (log.includes("can't find the format file") || log.includes(fmtFile)) {
    return `LaTeX 编译引擎 (${engineType}) 初始化失败

TexLive 服务器正在启动中，请稍后重试。

如果问题持续，请刷新页面或联系管理员。`;
  }
  
  // 检查网络/下载错误
  if (log.includes('Download Failed') || log.includes('fetch failed')) {
    return `无法连接到 TexLive 服务器

请检查网络连接后重试。`;
  }

  // 检查 CTeX 字体错误
  if (log.includes('CTeX fontset') && log.includes('unavailable')) {
    return `CTeX 字体错误

当前在线编译服务不支持 CTeX 字体。

解决方案：
1. 使用 xeCJK 宏包替代 ctex（如果服务器支持）
2. 或者将内容改为英文
3. 如需完整中文支持，请使用本地 TeX Live`;
  }

  // 检查 fontspec 字体找不到错误
  if (log.includes('fontspec') && log.includes('cannot be found')) {
    // 提取字体名称
    const fontMatch = log.match(/font "([^"]+)" cannot be found/i);
    const fontName = fontMatch ? fontMatch[1] : '指定的字体';
    
    return `字体 "${fontName}" 无法加载

在线编译器运行在浏览器中，无法访问系统字体。

解决方案：
1. 移除 xeCJK 和自定义字体设置，使用纯英文模板
2. 使用 CJKutf8 包替代（有限的中文支持）
3. 如需完整中文支持，请使用本地 TeX Live 或 Overleaf

示例（纯英文模板）：
\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}`;
  }

  // 检查字体找不到错误（通用）
  if (log.includes('Font') && (log.includes('not found') || log.includes('not loadable'))) {
    return `字体加载错误

在线编译服务缺少所需字体。

解决方案：
1. 使用基础字体（如 Computer Modern）
2. 移除 fontspec/xeCJK 相关设置
3. 或者使用本地 TeX Live 编译`;
  }
  
  // 尝试提取错误信息
  const lines = log.split('\n');
  const errorLines = [];
  let capturing = false;
  
  for (const line of lines) {
    if (line.startsWith('!')) {
      capturing = true;
      errorLines.push(line);
    } else if (capturing) {
      if (line.startsWith('l.') || line.trim() === '') {
        errorLines.push(line);
        if (line.trim() === '') capturing = false;
      } else if (errorLines.length < 5) {
        errorLines.push(line);
      }
    }
  }
  
  if (errorLines.length > 0) {
    return errorLines.join('\n');
  }
  
  // 如果没有找到明确错误，返回日志的最后几行
  const lastLines = lines.slice(-10).filter(l => l.trim());
  return lastLines.join('\n') || '编译失败，请检查 LaTeX 语法';
};

// 写入附加文件
export const writeFile = (filename, content) => {
  const engine = currentEngine === 'xetex' ? xeTeXEngine : pdfTeXEngine;
  if (!engine || engineStatus !== 'ready') {
    throw new Error('引擎未就绪');
  }
  engine.writeMemFSFile(filename, content);
};

// 创建文件夹
export const makeFolder = (folderPath) => {
  const engine = currentEngine === 'xetex' ? xeTeXEngine : pdfTeXEngine;
  if (!engine || engineStatus !== 'ready') {
    throw new Error('引擎未就绪');
  }
  engine.makeMemFSFolder(folderPath);
};

// 清除缓存
export const flushCache = () => {
  if (pdfTeXEngine) {
    pdfTeXEngine.flushCache();
  }
  if (xeTeXEngine) {
    xeTeXEngine.flushCache();
  }
};

// 释放之前的 PDF URL
export const revokePdfUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

export default {
  initializeEngine,
  compileLaTeX,
  writeFile,
  makeFolder,
  flushCache,
  revokePdfUrl,
  getStatus,
  addStatusListener,
  setEngineType,
  getCurrentEngineType
};
