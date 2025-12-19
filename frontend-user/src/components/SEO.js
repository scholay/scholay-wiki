/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { memo } from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * SEO Component - 用于管理页面的 meta 标签和结构化数据
 *
 * @param {string} title - 页面标题
 * @param {string} description - 页面描述
 * @param {string} keywords - 关键词（可选）
 * @param {string} canonical - 规范链接
 * @param {string} ogType - Open Graph类型（默认: website）
 * @param {string} ogImage - 社交分享图片
 * @param {Object} structuredData - 结构化数据（JSON-LD）
 */
const SEO = memo(({
  title = 'Scholay - AI驱动的学术搜索平台',
  description = 'Scholay是一个创新的学术搜索平台，提供AI驱动的文献检索、智能论文分析、引用图谱可视化等功能。',
  keywords,
  canonical,
  ogType = 'website',
  ogImage = '/og-image.png',
  structuredData,
  noindex = false,
}) => {
  const siteUrl = 'https://www.scholay.com';
  const fullCanonical = canonical ? `${siteUrl}${canonical}` : siteUrl;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={fullCanonical} />

      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:site_name" content="Scholay" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullCanonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImage} />

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
});

SEO.displayName = 'SEO';

export default SEO;
