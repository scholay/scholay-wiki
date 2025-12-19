/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * usePaperDetail - 论文详情自定义 Hook
 * 封装论文详情页面的状态和逻辑
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { trackPaperDetail } from '../utils/usageTracker';
import logger from '../utils/logger';

/**
 * usePaperDetail Hook
 * @param {string} paperId 论文 ID
 */
const usePaperDetail = (paperId) => {
  // 论文数据
  const [paper, setPaper] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab 状态
  const [activeTab, setActiveTab] = useState('citations');

  // 引用弹窗状态
  const [showCiteModal, setShowCiteModal] = useState(false);
  const [citationFormat, setCitationFormat] = useState('bibtex');
  const [copied, setCopied] = useState(false);
  const [copiedDoi, setCopiedDoi] = useState(false);
  const [copiedCorpusId, setCopiedCorpusId] = useState(false);

  // 相似论文状态
  const [showSimilarPopup, setShowSimilarPopup] = useState(false);
  const [similarPapers, setSimilarPapers] = useState([]);
  const [similarPapersLoading, setSimilarPapersLoading] = useState(false);
  const [similarPapersLoaded, setSimilarPapersLoaded] = useState(false);
  const isHoveringTitleRef = useRef(false);

  // 获取论文详情
  const fetchPaperDetails = useCallback(async () => {
    if (!paperId) return;
    
    try {
      setIsLoading(true);
      const fields = 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,journal,citations.paperId,citations.title,citations.authors,citations.year,citations.citationCount,references.paperId,references.title,references.authors,references.year,references.citationCount';
      
      const response = await api.get(`/public/papers/${paperId}`, {
        params: { fields }
      });
      setPaper(response.data.data);
      setError(null);
    } catch (err) {
      logger.error('Failed to fetch paper details:', err);
      setError(err.response?.data?.message || 'Failed to load paper details');
    } finally {
      setIsLoading(false);
    }
  }, [paperId]);

  // 获取相似论文
  const fetchSimilarPapers = useCallback(async () => {
    if (!paperId || similarPapersLoaded) return;
    
    try {
      setSimilarPapersLoading(true);
      const response = await api.get(`/public/papers/${paperId}/similar`, {
        params: { limit: 5 }
      });
      setSimilarPapers(response.data.data?.papers || []);
      setSimilarPapersLoaded(true);
    } catch (err) {
      logger.error('Failed to fetch similar papers:', err);
    } finally {
      setSimilarPapersLoading(false);
    }
  }, [paperId, similarPapersLoaded]);

  // 复制到剪贴板
  const copyToClipboard = useCallback(async (text, type = 'citation') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'doi') {
        setCopiedDoi(true);
        setTimeout(() => setCopiedDoi(false), 2000);
      } else if (type === 'corpusId') {
        setCopiedCorpusId(true);
        setTimeout(() => setCopiedCorpusId(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      logger.error('Failed to copy:', err);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchPaperDetails();
    if (paperId) {
      trackPaperDetail(paperId);
    }
  }, [paperId, fetchPaperDetails]);

  // 预加载相似论文
  useEffect(() => {
    if (paper && !similarPapersLoaded) {
      fetchSimilarPapers();
    }
  }, [paper, similarPapersLoaded, fetchSimilarPapers]);

  return {
    // 论文数据
    paper,
    isLoading,
    error,
    
    // Tab 状态
    activeTab,
    setActiveTab,
    
    // 引用弹窗
    showCiteModal,
    setShowCiteModal,
    citationFormat,
    setCitationFormat,
    copied,
    copiedDoi,
    copiedCorpusId,
    copyToClipboard,
    
    // 相似论文
    showSimilarPopup,
    setShowSimilarPopup,
    similarPapers,
    similarPapersLoading,
    similarPapersLoaded,
    isHoveringTitleRef,
    
    // 方法
    fetchPaperDetails,
    fetchSimilarPapers,
  };
};

export default usePaperDetail;
