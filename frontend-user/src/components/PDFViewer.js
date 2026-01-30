/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { trackPDFPreview, trackPDFSelectionTranslate, EntryPoint } from '../utils/usageTracker';
import { useTranslation, isPrimarilyChinese } from '../hooks/useTranslation';
import './PDFViewer.css';

// PDF 资源路径
const publicBase = process.env.PUBLIC_URL || '';
const pdfAssetsBase = `${publicBase}/pdfjs`;

// 使用 CDN 加载 worker（更可靠）
const PDFJS_VERSION = pdfjs.version;

// 优先使用 jsDelivr CDN（国内访问更快），unpkg 作为备用
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// 内存优化配置：只渲染可见页面附近的页面
const PAGES_TO_RENDER_BEFORE = 1;  // 当前页之前渲染的页数（减少以加快首次渲染）
const PAGES_TO_RENDER_AFTER = 2;   // 当前页之后渲染的页面
const MAX_RENDERED_PAGES = 6;      // 最大同时渲染的页数（减少以加快渲染）

// PDF 服务配置
// 使用本地后端接口（通过 Nginx 代理）
const PDF_API_URL = '/api/v1/pdf';
const SCIHUB_BASE_URL = 'https://sci-hub.box';

// 生成 Sci-Hub URL
const getSciHubUrl = (doi) => {
  if (!doi) return '';
  return `${SCIHUB_BASE_URL}/${doi}`;
};

// PDFViewer 组件
// pdfUrl: 开放获取的 PDF URL（可选）
// paperTitle: 论文标题
// doi: 论文 DOI（必填，用于后端获取 PDF）
// isCheckedPdf: 是否为已检测的非开放获取 PDF
const PDFViewer = React.memo(({ pdfUrl, paperTitle, doi, isCheckedPdf = false }) => {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(true); // 页面渲染中状态
  const [error, setError] = useState(null);
  const [isUnmounted, setIsUnmounted] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null); // 存储 PDF Blob 数据（不存储 ArrayBuffer，避免 detached）
  const [isFetchingDoi, setIsFetchingDoi] = useState(false); // DOI API 请求中
  const [useFallback, setUseFallback] = useState(false); // 是否使用备用方案
  const [enableTextLayer, setEnableTextLayer] = useState(false); // 延迟启用文本层
  const [autoOpenOnError, setAutoOpenOnError] = useState(() => {
    // 从 localStorage 读取用户偏好
    const saved = localStorage.getItem('pdf_auto_open_on_error');
    return saved === 'true';
  });
  const [isFullscreen, setIsFullscreen] = useState(false); // 全屏预览状态
  const [fullscreenScale, setFullscreenScale] = useState(1.2); // 全屏模式独立缩放
  const [showTranslateTip, setShowTranslateTip] = useState(true); // 翻译提示条
  const [selectedText, setSelectedText] = useState(''); // 选中的文本
  const [selectionPosition, setSelectionPosition] = useState(null); // 选中位置
  const [showTranslatePopup, setShowTranslatePopup] = useState(false); // 翻译弹窗
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1); // 当前可见页面（用于懒加载优化）
  const contentRef = useRef(null);
  const fullscreenContentRef = useRef(null);
  const hasAutoOpenedRef = useRef(false); // 防止重复打开
  const abortControllerRef = useRef(null); // 用于取消请求
  
  // 翻译 Hook
  const translation = useTranslation();

  // 计算需要渲染的页面范围（内存优化：只渲染可见页面附近的页面）
  const pagesToRender = useMemo(() => {
    if (!numPages) return [];
    
    // 对于小型 PDF（<=10页），渲染所有页面
    if (numPages <= MAX_RENDERED_PAGES) {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    
    // 对于大型 PDF，只渲染当前可见页面附近的页面
    const startPage = Math.max(1, currentVisiblePage - PAGES_TO_RENDER_BEFORE);
    const endPage = Math.min(numPages, currentVisiblePage + PAGES_TO_RENDER_AFTER);
    
    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [numPages, currentVisiblePage]);

  // 监听滚动以更新当前可见页面（用于懒加载）
  useEffect(() => {
    const container = isFullscreen ? fullscreenContentRef.current : contentRef.current;
    if (!container || !numPages || numPages <= MAX_RENDERED_PAGES) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      
      requestAnimationFrame(() => {
        const pages = container.querySelectorAll('.pdf-page');
        if (pages.length === 0) {
          ticking = false;
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 2;

        let closestPage = 1;
        let closestDistance = Infinity;

        pages.forEach((page) => {
          const pageRect = page.getBoundingClientRect();
          const pageCenter = pageRect.top + pageRect.height / 2;
          const distance = Math.abs(pageCenter - containerCenter);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            // 从 data 属性或页面顺序获取页码
            const pageNumber = parseInt(page.dataset?.pageNumber || '1', 10);
            if (!isNaN(pageNumber)) {
              closestPage = pageNumber;
            }
          }
        });

        setCurrentVisiblePage(closestPage);
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isFullscreen, numPages]);

  // 备用：使用外部预览服务（当 DOI API 不可用时）
  const proxyUrl = useMemo(
    () => pdfUrl ? `https://filepreview.scholay.com/api/preview?url=${encodeURIComponent(pdfUrl)}` : null,
    [pdfUrl]
  );

  // Sci-Hub 链接（当 PDF 加载失败时显示）
  const sciHubUrl = useMemo(() => getSciHubUrl(doi), [doi]);

  // 通过 DOI 获取 PDF
  useEffect(() => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 重置状态
    setNumPages(null);
    setIsLoading(true);
    setIsRendering(true);
    setError(null);
    setScale(1.0);
    setIsUnmounted(false);
    setPdfBlob(null);
    setUseFallback(false);
    setEnableTextLayer(false);
    hasAutoOpenedRef.current = false;

    // 记录PDF预览使用统计
    if (pdfUrl) {
      trackPDFPreview(pdfUrl, EntryPoint.PAPER_DETAIL_PAGE);
    }

    // 如果有 DOI，使用新的 PDF API
    // 对于已检测的 PDF（isCheckedPdf），必须使用 DOI API
    if (doi) {
      setIsFetchingDoi(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fetchPdfByDoi = async () => {
        try {
          // 构建请求体，如果有 pdfUrl 则传递给后端作为优先来源
          const requestBody = { doi };
          if (pdfUrl) {
            requestBody.pdf_url = pdfUrl;
          }
          
          const response = await fetch(PDF_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`PDF API 返回错误: ${response.status}`);
          }

          // 读取自定义响应头（来源和缓存状态）
          const pdfSource = response.headers.get('X-PDF-Source');
          const cacheStatus = response.headers.get('X-Cache');
          console.log('[PDFViewer] PDF Source:', pdfSource, 'Cache:', cacheStatus);

          const blob = await response.blob();
          
          if (!controller.signal.aborted) {
            // 验证 Blob 有效性
            if (!blob || blob.size === 0) {
              throw new Error('PDF 数据为空');
            }
            
            // 检查是否为 PDF 类型（允许 application/pdf 或 application/octet-stream）
            const validTypes = ['application/pdf', 'application/octet-stream', ''];
            if (!validTypes.includes(blob.type)) {
              console.warn('PDF Blob 类型:', blob.type, '大小:', blob.size);
            }
            
            console.log('[PDFViewer] PDF 数据获取成功, 大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
            
            // 存储 Blob，后续需要时再转换为 ArrayBuffer
            setPdfBlob(blob);
            setIsFetchingDoi(false);
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // 请求被取消，忽略
          }
          console.warn('DOI PDF API 失败:', err);
          
          if (!controller.signal.aborted) {
            // 如果是已检测的 PDF（非开放获取），没有备用方案，显示错误
            if (isCheckedPdf || !pdfUrl) {
              setPdfBlob(null);
              setUseFallback(false);
              setIsFetchingDoi(false);
              setIsLoading(false);
              setError('PDF 加载失败，请尝试通过 Sci-Hub 获取');
            } else {
              // DOI API 失败，回退到代理服务
              setPdfBlob(null);
              setUseFallback(true);
              setIsFetchingDoi(false);
            }
          }
        }
      };

      fetchPdfByDoi();

      return () => {
        controller.abort();
      };
    } else if (pdfUrl) {
      // 没有 DOI 但有 pdfUrl，使用备用方案
      setUseFallback(true);
    } else {
      // 既没有 DOI 也没有 pdfUrl
      setIsLoading(false);
      setError('没有可用的 PDF 来源');
    }
  }, [pdfUrl, doi, isCheckedPdf]);

  // 切换自动打开设置
  const toggleAutoOpen = () => {
    const newValue = !autoOpenOnError;
    setAutoOpenOnError(newValue);
    localStorage.setItem('pdf_auto_open_on_error', String(newValue));
  };

  // 组件卸载时的清理（内存优化：清理 PDF Blob）
  useEffect(() => {
    return () => {
      setIsUnmounted(true);
      // 取消正在进行的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 清理 PDF Blob 以释放内存
      setPdfBlob(null);
    };
  }, []);

  const onDocumentLoadSuccess = ({ numPages }) => {
    if (isUnmounted) return;
    console.log('[PDFViewer] PDF 解析成功, 总页数:', numPages);
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    // 延迟启用文本层，让页面先快速渲染出来
    setTimeout(() => {
      if (!isUnmounted) {
        setEnableTextLayer(true);
      }
    }, 500);
  };

  const onPageRenderSuccess = useCallback(() => {
    if (isUnmounted) return;
    // 标记渲染完成
    setIsRendering(false);
    // 当第一页渲染完成后,初始化滚动位置到中心
    if (contentRef.current) {
      setTimeout(() => {
        if (contentRef.current) {
          const container = contentRef.current;
          container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
        }
      }, 50);
    }
  }, [isUnmounted]);

  const onDocumentLoadError = (error) => {
    if (isUnmounted) return;
    console.error('[PDFViewer] PDF 解析失败:', error);
    console.error('[PDFViewer] 错误详情:', error?.message || error);
    
    // 提供更详细的错误信息
    let errorMessage = 'PDF 暂时无法加载';
    if (error?.message?.includes('Invalid PDF')) {
      errorMessage = 'PDF 文件格式无效';
    } else if (error?.message?.includes('Missing PDF')) {
      errorMessage = 'PDF 文件损坏或不完整';
    } else if (error?.message?.includes('password')) {
      errorMessage = 'PDF 文件需要密码';
    }
    
    setError(`${errorMessage}，请点击下方按钮在新窗口中查看`);
    setIsLoading(false);
    setIsRendering(false);
    
    // 如果开启了自动打开，且还未自动打开过，则自动在新窗口打开
    if (autoOpenOnError && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 配置PDF加载选项 - 使用 useMemo 避免每次渲染都创建新对象
  const pdfOptions = useMemo(() => ({
    withCredentials: false,
  }), []);

  const documentOptions = useMemo(() => ({
    cMapUrl: `${pdfAssetsBase}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfAssetsBase}/standard_fonts/`,
  }), []);

  // 从 Blob 创建 Object URL，避免 ArrayBuffer detached 问题
  const [blobUrl, setBlobUrl] = useState(null);
  
  useEffect(() => {
    if (pdfBlob) {
      console.log('[PDFViewer] 创建 Blob URL, Blob 大小:', pdfBlob.size);
      const url = URL.createObjectURL(pdfBlob);
      console.log('[PDFViewer] Blob URL 已创建:', url);
      setBlobUrl(url);
      return () => {
        console.log('[PDFViewer] 清理 Blob URL');
        URL.revokeObjectURL(url);
      };
    } else {
      setBlobUrl(null);
    }
  }, [pdfBlob]);

  // 创建稳定的 file 对象，避免 Document 组件因对象引用变化而重新挂载
  // 优先使用 DOI API 返回的数据（Blob URL），否则使用代理服务
  const fileConfig = useMemo(() => {
    if (blobUrl) {
      console.log('[PDFViewer] 使用 Blob URL 加载 PDF');
      // 使用从 DOI API 获取的 Blob URL
      return {
        url: blobUrl,
        ...pdfOptions
      };
    }
    if (useFallback) {
      console.log('[PDFViewer] 使用代理服务加载 PDF');
      // 回退到代理服务
      return {
        url: proxyUrl,
        ...pdfOptions
      };
    }
    // 还在请求中，返回 null
    return null;
  }, [blobUrl, useFallback, proxyUrl, pdfOptions]);

  // 是否可以渲染 PDF Document
  const canRenderDocument = !isFetchingDoi && fileConfig !== null;
  
  // Debug: 监控渲染条件
  useEffect(() => {
    console.log('[PDFViewer] 渲染条件:', {
      isFetchingDoi,
      hasFileConfig: fileConfig !== null,
      canRenderDocument,
      hasBlobUrl: !!blobUrl,
      useFallback,
      isLoading,
      error
    });
  }, [isFetchingDoi, fileConfig, canRenderDocument, blobUrl, useFallback, isLoading, error]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 5.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  // 下载 PDF（使用已有数据，不重复请求）
  const handleDownload = useCallback(() => {
    if (!pdfBlob) return;
    
    // 直接使用 Blob 创建下载链接
    const url = URL.createObjectURL(pdfBlob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    // 清理文件名中的特殊字符
    const safeName = (paperTitle || 'paper').replace(/[<>:"/\\|?*]/g, '_');
    link.download = `${safeName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }, [pdfBlob, paperTitle]);

  // 打开全屏预览
  const handleOpenFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setFullscreenScale(1.2); // 全屏模式默认更大的缩放
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
  }, []);

  // 关闭全屏预览
  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
    // 恢复背景滚动
    document.body.style.overflow = '';
  }, []);

  // ESC 键关闭全屏
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleCloseFullscreen();
      }
    };
    
    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, handleCloseFullscreen]);

  // 全屏模式缩放控制
  const handleFullscreenZoomIn = () => {
    setFullscreenScale(prev => Math.min(prev + 0.2, 5.0));
  };

  const handleFullscreenZoomOut = () => {
    setFullscreenScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleFullscreenResetZoom = () => {
    setFullscreenScale(1.2);
  };

  // 关闭翻译提示条
  const handleCloseTip = useCallback(() => {
    setShowTranslateTip(false);
    // 保存用户偏好到 localStorage
    localStorage.setItem('pdf_translate_tip_dismissed', 'true');
  }, []);

  // 检查是否需要显示翻译提示
  useEffect(() => {
    const dismissed = localStorage.getItem('pdf_translate_tip_dismissed');
    if (dismissed === 'true') {
      setShowTranslateTip(false);
    }
  }, []);

  // 处理文本选择（使用鼠标位置定位翻译按钮）
  const handleTextSelection = useCallback((containerRef, mouseX, mouseY) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    
    if (text && text.length > 0 && text.length < 2000) {
      // 检查是否为非中文内容
      if (!isPrimarilyChinese(text)) {
        const container = containerRef?.current;
        const containerRect = container?.getBoundingClientRect() || { top: 0, left: 0 };
        
        // 获取容器的滚动位置
        const scrollTop = container?.scrollTop || 0;
        const scrollLeft = container?.scrollLeft || 0;
        
        // 使用鼠标位置定位翻译按钮（在鼠标下方偏移 8px）
        // 需要加上滚动偏移量，因为 absolute 定位是相对于容器内容区域
        setSelectedText(text);
        setSelectionPosition({
          top: mouseY - containerRect.top + scrollTop + 8,
          left: mouseX - containerRect.left + scrollLeft,
        });
        setShowTranslatePopup(true);
      } else {
        // 中文内容，清除弹窗
        setShowTranslatePopup(false);
        setSelectedText('');
      }
    } else {
      // 没有选中有效文本
      setShowTranslatePopup(false);
      setSelectedText('');
    }
  }, []);

  // 获取当前翻译状态（需要在 useEffect 之前定义）
  const currentTranslationKey = selectionPosition?.translationKey;
  const translationState = currentTranslationKey 
    ? translation.getTranslationState(currentTranslationKey)
    : { status: 'idle', text: '', error: '' };

  // 执行翻译
  const handleTranslate = useCallback(() => {
    if (selectedText) {
      const key = `pdf_selection_${Date.now()}`;
      translation.translate(key, selectedText);
      // 存储当前翻译的 key
      setSelectionPosition(prev => prev ? { ...prev, translationKey: key } : null);
      // 记录划词翻译使用统计
      trackPDFSelectionTranslate(selectedText, isFullscreen);
    }
  }, [selectedText, translation, isFullscreen]);

  // 关闭翻译弹窗
  const handleCloseTranslatePopup = useCallback(() => {
    setShowTranslatePopup(false);
    setSelectedText('');
    setSelectionPosition(null);
  }, []);

  // 监听内容区域的鼠标抬起事件（文本选择）
  useEffect(() => {
    const handleMouseUp = (e) => {
      // 如果点击的是翻译弹窗内的元素，不处理
      if (e.target.closest('.pdf-translate-popup')) {
        return;
      }
      // 保存鼠标位置
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      // 延迟处理，确保选择完成
      setTimeout(() => {
        if (isFullscreen) {
          handleTextSelection(fullscreenContentRef, mouseX, mouseY);
        } else {
          handleTextSelection(contentRef, mouseX, mouseY);
        }
      }, 10);
    };

    const handleMouseDown = (e) => {
      // 如果点击的是翻译弹窗内的元素，不关闭
      if (e.target.closest('.pdf-translate-popup')) {
        return;
      }
      // 点击其他区域时关闭翻译弹窗（如果没有正在翻译）
      if (translationState.status !== 'translating') {
        setShowTranslatePopup(false);
      }
    };

    const container = isFullscreen ? fullscreenContentRef.current : contentRef.current;
    if (container) {
      container.addEventListener('mouseup', handleMouseUp);
      container.addEventListener('mousedown', handleMouseDown);
    }

    return () => {
      if (container) {
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('mousedown', handleMouseDown);
      }
    };
  }, [isFullscreen, handleTextSelection, translationState.status]);

  return (
    <div className="pdf-viewer">
      {/* 工具栏 */}
      <div className="pdf-toolbar">
        <div className="pdf-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="pdf-title">{paperTitle || 'PDF预览'}</span>
        </div>

        <div className="pdf-controls">
          {/* 缩放控制 */}
          <div className="zoom-controls">
            <button
              className="control-btn"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              title="缩小"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button
              className="control-btn"
              onClick={handleZoomIn}
              disabled={scale >= 5.0}
              title="放大"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <button
              className="control-btn"
              onClick={handleResetZoom}
              title="重置缩放"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>

          <div className="divider"></div>

          {numPages && (
            <div className="page-controls">
              <span className="page-info">共 {numPages} 页</span>
            </div>
          )}

          <div className="divider"></div>

          {/* 放大查看按钮 - PDF 加载成功后显示 */}
          {pdfBlob && numPages && (
            <button
              className="control-btn fullscreen-btn"
              onClick={handleOpenFullscreen}
              title="放大查看"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/>
                <polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/>
                <line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          )}

          {/* 下载按钮 - PDF 数据存在时显示 */}
          {pdfBlob && (
            <button
              className="control-btn download-btn"
              onClick={handleDownload}
              title="下载 PDF"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}

          {/* 外部打开 */}
          {(pdfUrl || sciHubUrl) && (
            <a
              href={pdfUrl || sciHubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="control-btn external-btn"
              title={pdfUrl ? "在新窗口打开" : "通过 Sci-Hub 打开"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* 翻译功能提示条 */}
      {showTranslateTip && numPages && (
        <div className="pdf-translate-tip">
          <div className="pdf-translate-tip-content">
            <span className="pdf-translate-tip-new">NEW</span>
            <svg className="pdf-translate-tip-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
              <path d="M21.5 12.5L18 22l-1.5-4L12.5 16l9-3.5z"/>
            </svg>
            <span>划选英文内容可快速翻译</span>
          </div>
          <button className="pdf-translate-tip-close" onClick={handleCloseTip} title="不再提示">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* PDF 内容区域 */}
      <div ref={contentRef} className={`pdf-content ${isLoading || isRendering ? 'pdf-content--loading' : ''}`}>
        {(isLoading || (isRendering && numPages)) && !error && (
          <div className="pdf-skeleton-overlay" aria-hidden="true">
            <div className="pdf-skeleton">
              {Array.from({ length: Math.min(numPages || 3, 3) }, (_, index) => (
                <div className="pdf-skeleton-page" key={`skeleton_${index}`}>
                  <div className="pdf-skeleton-shimmer" />
                </div>
              ))}
              <span className="pdf-skeleton-text">
                {isFetchingDoi ? '正在获取PDF数据…' : 
                 isLoading ? '正在解析PDF…' : 
                 '正在渲染页面…'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="pdf-error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{error}</p>
            
            {/* 如果有原始 PDF URL，显示打开链接 */}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="fallback-link">
                在新窗口打开PDF
              </a>
            )}
            
            {/* 如果有 DOI，显示 Sci-Hub 链接 */}
            {sciHubUrl && (
              <a href={sciHubUrl} target="_blank" rel="noopener noreferrer" className="fallback-link scihub-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                通过 Sci-Hub 获取
              </a>
            )}
            
            {pdfUrl && (
              <label className="auto-open-toggle">
                <input
                  type="checkbox"
                  checked={autoOpenOnError}
                  onChange={toggleAutoOpen}
                />
                <span className="toggle-label">加载失败时自动打开</span>
              </label>
            )}
          </div>
        )}

        {!error && canRenderDocument && !isFullscreen && (
          <Document
            file={fileConfig}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
            error=""
            className="pdf-document"
            options={documentOptions}
          >
              {/* 内存优化：只渲染可见页面附近的页面，使用占位符保持滚动位置 */}
              {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
                .map(pageNumber => {
                  const shouldRender = pagesToRender.includes(pageNumber);
                  if (!shouldRender) {
                    // 渲染占位符以保持滚动高度
                    return (
                      <div
                        key={`placeholder_${pageNumber}`}
                        className="pdf-page-placeholder"
                        style={{ 
                          height: `${Math.round(800 * scale)}px`,
                          width: `${Math.round(600 * scale)}px`,
                        }}
                        data-page-number={pageNumber}
                      />
                    );
                  }
                  return (
                    <Page
                      key={`page_${pageNumber}`}
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={enableTextLayer}
                      renderAnnotationLayer={enableTextLayer}
                      className="pdf-page"
                      loading=""
                      error=""
                      onRenderSuccess={pageNumber === 1 ? onPageRenderSuccess : undefined}
                      data-page-number={pageNumber}
                    />
                  );
                })}
          </Document>
        )}

        {/* 划线翻译弹窗 */}
        {showTranslatePopup && selectionPosition && !isFullscreen && (
          <div 
            className="pdf-translate-popup"
            style={{
              top: selectionPosition.top,
              left: selectionPosition.left,
            }}
          >
            {translationState.status === 'idle' ? (
              <button className="pdf-translate-btn" onClick={handleTranslate}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 8l6 6"/>
                  <path d="M4 14l6-6 2-3"/>
                  <path d="M2 5h12"/>
                  <path d="M7 2v3"/>
                  <path d="M22 22l-5-10-5 10"/>
                  <path d="M14 18h6"/>
                </svg>
                翻译
              </button>
            ) : (
              <div className="pdf-translate-result">
                <div className="pdf-translate-result-header">
                  <span className="pdf-translate-result-title">
                    {translationState.status === 'translating' ? '翻译中...' : '翻译结果'}
                  </span>
                  <button className="pdf-translate-result-close" onClick={handleCloseTranslatePopup}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <div className="pdf-translate-result-content">
                  {translationState.status === 'error' ? (
                    <span className="pdf-translate-error">{translationState.error || '翻译失败'}</span>
                  ) : (
                    <span>{translationState.text || '...'}</span>
                  )}
                </div>
                {selectedText && (
                  <div className="pdf-translate-original">
                    <span className="pdf-translate-original-label">原文：</span>
                    <span className="pdf-translate-original-text">{selectedText.length > 100 ? selectedText.slice(0, 100) + '...' : selectedText}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 全屏预览弹窗 */}
      {isFullscreen && numPages && createPortal(
        <div className="pdf-fullscreen-overlay" onClick={handleCloseFullscreen}>
          <div className="pdf-fullscreen-modal" onClick={(e) => e.stopPropagation()}>
            {/* 全屏工具栏 */}
            <div className="pdf-fullscreen-toolbar">
              <div className="pdf-fullscreen-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{paperTitle || 'PDF预览'}</span>
              </div>

              <div className="pdf-fullscreen-controls">
                {/* 缩放控制 */}
                <button
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenZoomOut}
                  disabled={fullscreenScale <= 0.5}
                  title="缩小"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </button>
                <span className="fullscreen-zoom-level">{Math.round(fullscreenScale * 100)}%</span>
                <button
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenZoomIn}
                  disabled={fullscreenScale >= 5.0}
                  title="放大"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="11" y1="8" x2="11" y2="14"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </button>
                <button
                  className="fullscreen-control-btn"
                  onClick={handleFullscreenResetZoom}
                  title="重置缩放"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>

                <div className="fullscreen-divider"></div>

                {numPages && (
                  <span className="fullscreen-page-info">共 {numPages} 页</span>
                )}

                <div className="fullscreen-divider"></div>

                {/* 下载按钮 */}
                <button
                  className="fullscreen-control-btn"
                  onClick={handleDownload}
                  title="下载 PDF"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>

                {/* 关闭按钮 */}
                <button
                  className="fullscreen-control-btn fullscreen-close-btn"
                  onClick={handleCloseFullscreen}
                  title="关闭 (ESC)"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* 全屏翻译提示 - 浮动在右下角 */}
            {showTranslateTip && (
              <div className="pdf-translate-tip pdf-translate-tip-fullscreen">
                <div className="pdf-translate-tip-content">
                  <span className="pdf-translate-tip-new">NEW</span>
                  <svg className="pdf-translate-tip-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
                    <path d="M21.5 12.5L18 22l-1.5-4L12.5 16l9-3.5z"/>
                  </svg>
                  <span>划选英文内容可快速翻译</span>
                </div>
                <button className="pdf-translate-tip-close" onClick={handleCloseTip} title="不再提示">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

            {/* 全屏 PDF 内容 */}
            <div ref={fullscreenContentRef} className="pdf-fullscreen-content">
              <Document
                file={fileConfig}
                loading=""
                error=""
                className="pdf-document"
                options={documentOptions}
              >
                {Array.from({ length: numPages || 0 }, (_, index) => index + 1)
                  .map(pageNumber => (
                    <Page
                      key={`fullscreen_page_${pageNumber}`}
                      pageNumber={pageNumber}
                      scale={fullscreenScale}
                      renderTextLayer={enableTextLayer}
                      renderAnnotationLayer={enableTextLayer}
                      className="pdf-page"
                      loading=""
                      error=""
                    />
                  ))}
              </Document>

              {/* 全屏模式翻译弹窗 */}
              {showTranslatePopup && selectionPosition && (
                <div 
                  className="pdf-translate-popup"
                  style={{
                    top: selectionPosition.top,
                    left: selectionPosition.left,
                  }}
                >
                  {translationState.status === 'idle' ? (
                    <button className="pdf-translate-btn" onClick={handleTranslate}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 8l6 6"/>
                        <path d="M4 14l6-6 2-3"/>
                        <path d="M2 5h12"/>
                        <path d="M7 2v3"/>
                        <path d="M22 22l-5-10-5 10"/>
                        <path d="M14 18h6"/>
                      </svg>
                      翻译
                    </button>
                  ) : (
                    <div className="pdf-translate-result">
                      <div className="pdf-translate-result-header">
                        <span className="pdf-translate-result-title">
                          {translationState.status === 'translating' ? '翻译中...' : '翻译结果'}
                        </span>
                        <button className="pdf-translate-result-close" onClick={handleCloseTranslatePopup}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                      <div className="pdf-translate-result-content">
                        {translationState.status === 'error' ? (
                          <span className="pdf-translate-error">{translationState.error || '翻译失败'}</span>
                        ) : (
                          <span>{translationState.text || '...'}</span>
                        )}
                      </div>
                      {selectedText && (
                        <div className="pdf-translate-original">
                          <span className="pdf-translate-original-label">原文：</span>
                          <span className="pdf-translate-original-text">{selectedText.length > 100 ? selectedText.slice(0, 100) + '...' : selectedText}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数：只在关键 props 变化时才重新渲染
  return prevProps.pdfUrl === nextProps.pdfUrl &&
         prevProps.paperTitle === nextProps.paperTitle &&
         prevProps.doi === nextProps.doi &&
         prevProps.isCheckedPdf === nextProps.isCheckedPdf;
});

export default PDFViewer;
