/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 编译器 - 基于 SwiftLaTeX WASM
 */

// 使用绝对路径
const BASE_PATH = '/core/swiftlatex';

// 全局引擎实例
let pdfTeXEngine = null;
let engineStatus = 'unloaded'; // unloaded, loading, ready, compiling, error

// 状态监听器
const statusListeners = new Set();

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

// 初始化引擎
export const initializeEngine = async () => {
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
    
    // 加载引擎（创建 Worker）
    await pdfTeXEngine.loadEngine();
    
    // 使用 texlyre.org 公共 TexLive 服务器
    const texliveEndpoint = 'https://texlive.texlyre.org/';
    pdfTeXEngine.setTexliveEndpoint(texliveEndpoint);
    
    console.log(`[LatexCompiler] Engine loaded. Using TexLive server: ${texliveEndpoint}`);

    setStatus('ready');
    console.log('[LatexCompiler] Engine initialized successfully');
    return true;
  } catch (error) {
    console.error('[LatexCompiler] Failed to initialize engine:', error);
    setStatus('error');
    return false;
  }
};

// 编译 LaTeX
export const compileLaTeX = async (content, mainFileName = 'main.tex') => {
  // 确保引擎已初始化
  if (engineStatus !== 'ready') {
    const initialized = await initializeEngine();
    if (!initialized) {
      throw new Error('编译引擎初始化失败，请刷新页面重试');
    }
  }

  if (!pdfTeXEngine) {
    throw new Error('编译引擎未初始化');
  }

  setStatus('compiling');

  try {
    // 写入文件到虚拟文件系统
    pdfTeXEngine.writeMemFSFile(mainFileName, content);
    pdfTeXEngine.setEngineMainFile(mainFileName);

    // 编译（运行三次以处理引用和目录）
    console.log('[LatexCompiler] Starting compilation...');
    await pdfTeXEngine.compileLaTeX();
    await pdfTeXEngine.compileLaTeX();
    const result = await pdfTeXEngine.compileLaTeX();

    setStatus('ready');

    console.log('[LatexCompiler] Compilation result:', {
      status: result.status,
      hasPdf: !!result.pdf,
      pdfSize: result.pdf?.length,
      logLength: result.log?.length
    });

    if (result.pdf) {
      // 创建 Blob URL
      const blob = new Blob([result.pdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      return {
        success: true,
        pdfUrl: url,
        log: result.log
      };
    } else {
      return {
        success: false,
        error: parseCompileError(result.log),
        log: result.log
      };
    }
  } catch (error) {
    setStatus('ready');
    console.error('[LatexCompiler] Compilation error:', error);
    throw error;
  }
};

// 解析编译错误
const parseCompileError = (log) => {
  if (!log) return '编译失败，未知错误';
  
  // 检查是否是 TexLive 服务器不可用的错误
  if (log.includes("can't find the format file") || log.includes('swiftlatexpdftex.fmt')) {
    return `LaTeX 编译引擎初始化失败

TexLive 服务器正在启动中，请稍后重试。

如果问题持续，请刷新页面或联系管理员。`;
  }
  
  // 检查网络/下载错误
  if (log.includes('Download Failed') || log.includes('fetch failed')) {
    return `无法连接到 TexLive 服务器

请检查网络连接后重试。`;
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
  if (!pdfTeXEngine || engineStatus !== 'ready') {
    throw new Error('引擎未就绪');
  }
  pdfTeXEngine.writeMemFSFile(filename, content);
};

// 创建文件夹
export const makeFolder = (folderPath) => {
  if (!pdfTeXEngine || engineStatus !== 'ready') {
    throw new Error('引擎未就绪');
  }
  pdfTeXEngine.makeMemFSFolder(folderPath);
};

// 清除缓存
export const flushCache = () => {
  if (pdfTeXEngine) {
    pdfTeXEngine.flushCache();
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
  addStatusListener
};
