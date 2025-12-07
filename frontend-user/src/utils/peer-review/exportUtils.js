/**
 * 审稿报告导出工具
 * 支持 Word、PDF、PPT 格式导出
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, Header, Footer, PageNumber, NumberFormat } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import PptxGenJS from 'pptxgenjs';

// 品牌信息
const BRAND = {
  name: 'Scholay',
  slogan: '科研者的瑞士军刀',
  disclaimer: '免责声明：本报告由AI生成，建议仅供参考，不构成最终学术评价意见。',
  watermark: 'scholay.com',
  website: 'scholar.ai',
};

// 获取推荐意见的中文名称
const getRecommendationText = (recommendation) => {
  if (!recommendation) return '待定';
  const lower = recommendation.toLowerCase();
  if (lower.includes('accept')) return '接受';
  if (lower.includes('minor')) return '小修';
  if (lower.includes('major')) return '大修';
  if (lower.includes('reject')) return '拒稿';
  return recommendation;
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('zh-CN');
  return new Date(dateStr).toLocaleDateString('zh-CN');
};

// 格式化可复现性内容（处理对象格式）
const formatReproducibility = (reproducibility) => {
  if (!reproducibility) return '';
  if (typeof reproducibility === 'string') return reproducibility;
  
  const parts = [];
  if (reproducibility.data_availability) {
    parts.push(`数据可用性：${reproducibility.data_availability}`);
  }
  if (reproducibility.code_availability) {
    parts.push(`代码可用性：${reproducibility.code_availability}`);
  }
  return parts.join('\n');
};

// 格式化扩展评审项内容
const formatExtendedItem = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    // 特殊处理可复现性
    if (item.data_availability || item.code_availability) {
      return formatReproducibility(item);
    }
    // 其他对象类型
    return Object.entries(item)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }
  return String(item);
};

// 解析单个审稿人的报告
const parseReviewerReport = (content) => {
  if (!content) return null;
  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // 直接解析
    if (content.trim().startsWith('{')) {
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('Failed to parse reviewer report:', e);
  }
  return null;
};

/**
 * 导出为 Word 文档
 */
export const exportToWord = async (task, parsedReport) => {
  const children = [];
  
  // 标题
  children.push(
    new Paragraph({
      text: '审稿报告',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );
  
  // 基本信息
  children.push(
    new Paragraph({
      text: `审稿意见：${getRecommendationText(task.final_recommendation || task.recommendation)}`,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: '审稿意见：', bold: true }),
        new TextRun({ text: getRecommendationText(task.final_recommendation || task.recommendation) }),
      ],
    })
  );
  
  if (task.consensus_score > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: '三审一致性：', bold: true }),
          new TextRun({ text: `${Math.round(task.consensus_score * 100)}%` }),
        ],
        spacing: { after: 200 },
      })
    );
  }
  
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: '生成日期：', bold: true }),
        new TextRun({ text: formatDate(task.completed_at || task.created_at) }),
      ],
      spacing: { after: 400 },
    })
  );

  // 分隔线
  children.push(new Paragraph({ text: '─'.repeat(50), spacing: { after: 300 } }));

  // 总体评估
  if (parsedReport?.overall_assessment?.summary) {
    children.push(
      new Paragraph({
        text: '总体评估',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      })
    );
    children.push(
      new Paragraph({
        text: parsedReport.overall_assessment.summary,
        spacing: { after: 300 },
      })
    );
  }

  // 关键问题
  if (parsedReport?.critical_issues?.length > 0) {
    children.push(
      new Paragraph({
        text: `关键问题 (${parsedReport.critical_issues.length})`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      })
    );
    
    parsedReport.critical_issues.forEach((issue, idx) => {
      const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
      const description = issue.issue_description || issue.description || issue.detail || '';
      const suggestion = issue.required_actions || issue.suggestion || '';
      
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true }),
            new TextRun({ text: title, bold: true }),
          ],
          spacing: { before: 150, after: 100 },
        })
      );
      
      if (description) {
        children.push(
          new Paragraph({
            text: description,
            indent: { left: 360 },
            spacing: { after: 100 },
          })
        );
      }
      
      if (suggestion) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '建议：', bold: true, color: '10a37f' }),
              new TextRun({ text: suggestion }),
            ],
            indent: { left: 360 },
            spacing: { after: 150 },
          })
        );
      }
    });
  }

  // 改进建议
  if (parsedReport?.other_suggestions?.length > 0) {
    children.push(
      new Paragraph({
        text: `改进建议 (${parsedReport.other_suggestions.length})`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      })
    );
    
    parsedReport.other_suggestions.forEach((sug, idx) => {
      const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
      const description = sug.suggestion_description || sug.description || '';
      
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true }),
            new TextRun({ text: title }),
          ],
          spacing: { before: 150, after: 100 },
        })
      );
      
      if (description) {
        children.push(
          new Paragraph({
            text: description,
            indent: { left: 360 },
            spacing: { after: 150 },
          })
        );
      }
    });
  }

  // 详细评审
  if (parsedReport?.extended_review_items) {
    children.push(
      new Paragraph({
        text: '详细评审',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      })
    );
    
    const items = parsedReport.extended_review_items;
    const reviewItems = [
      { key: 'novelty_evaluation', label: '新颖性评价' },
      { key: 'technical_soundness', label: '技术严谨性' },
      { key: 'clarity_and_presentation', label: '清晰度与呈现' },
      { key: 'reproducibility', label: '可复现性' },
      { key: 'ethical_considerations', label: '伦理考量' },
      { key: 'impact_and_significance', label: '影响力与重要性' },
      { key: 'recommend_for_improvement', label: '改进建议' },
    ];
    
    reviewItems.forEach(({ key, label }) => {
      if (items[key]) {
        children.push(
          new Paragraph({
            text: label,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
        
        const content = formatExtendedItem(items[key]);
        
        // 如果内容包含换行，分行显示
        content.split('\n').forEach(line => {
          children.push(
            new Paragraph({
              text: line,
              spacing: { after: 80 },
            })
          );
        });
      }
    });
  }

  // 添加单个审稿人报告
  if (task.reviews && task.reviews.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { after: 400 } }));
    children.push(new Paragraph({ text: '═'.repeat(50), spacing: { after: 300 } }));
    
    children.push(
      new Paragraph({
        text: '各审稿人独立意见',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 300 },
      })
    );
    
    task.reviews.forEach((review, reviewIdx) => {
      if (review.status !== 'completed') return;
      
      const reviewerLabel = ['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index;
      const reviewerReport = parseReviewerReport(review.review_content);
      
      // 审稿人标题
      children.push(new Paragraph({ text: '─'.repeat(40), spacing: { before: 200, after: 200 } }));
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `审稿人 ${reviewerLabel}`, bold: true, size: 28 }),
            review.recommendation ? new TextRun({ text: `  [${review.recommendation}]`, color: '10a37f' }) : null,
          ].filter(Boolean),
          spacing: { after: 200 },
        })
      );
      
      if (reviewerReport) {
        // 总体评估
        if (reviewerReport.overall_assessment?.summary) {
          children.push(
            new Paragraph({
              text: '总体评估',
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 150, after: 100 },
            })
          );
          children.push(
            new Paragraph({
              text: reviewerReport.overall_assessment.summary,
              spacing: { after: 150 },
            })
          );
        }
        
        // 关键问题
        if (reviewerReport.critical_issues?.length > 0) {
          children.push(
            new Paragraph({
              text: `关键问题 (${reviewerReport.critical_issues.length})`,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 150, after: 100 },
            })
          );
          
          reviewerReport.critical_issues.forEach((issue, idx) => {
            const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
            const description = issue.issue_description || issue.description || issue.detail || '';
            const suggestion = issue.required_actions || issue.suggestion || '';
            
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${idx + 1}. `, bold: true }),
                  new TextRun({ text: title, bold: true }),
                ],
                spacing: { after: description || suggestion ? 50 : 80 },
              })
            );
            
            if (description) {
              children.push(
                new Paragraph({
                  text: description,
                  indent: { left: 360 },
                  spacing: { after: suggestion ? 50 : 80 },
                })
              );
            }
            
            if (suggestion) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: '建议：', bold: true, color: '10a37f' }),
                    new TextRun({ text: suggestion }),
                  ],
                  indent: { left: 360 },
                  spacing: { after: 100 },
                })
              );
            }
          });
        }
        
        // 改进建议
        if (reviewerReport.other_suggestions?.length > 0) {
          children.push(
            new Paragraph({
              text: `改进建议 (${reviewerReport.other_suggestions.length})`,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 150, after: 100 },
            })
          );
          
          reviewerReport.other_suggestions.forEach((sug, idx) => {
            const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
            const description = sug.suggestion_description || sug.description || '';
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${idx + 1}. `, bold: true }),
                  new TextRun({ text: title }),
                ],
                spacing: { after: description ? 50 : 80 },
              })
            );
            if (description) {
              children.push(
                new Paragraph({
                  text: description,
                  indent: { left: 360 },
                  spacing: { after: 80 },
                })
              );
            }
          });
        }
        
        // 详细评审
        if (reviewerReport.extended_review_items) {
          const reviewerItems = reviewerReport.extended_review_items;
          const detailItems = [
            { key: 'novelty_evaluation', label: '新颖性评价' },
            { key: 'technical_soundness', label: '技术严谨性' },
            { key: 'clarity_and_presentation', label: '清晰度与呈现' },
            { key: 'reproducibility', label: '可复现性' },
            { key: 'ethical_considerations', label: '伦理考量' },
            { key: 'impact_and_significance', label: '影响力与重要性' },
          ];
          
          const hasDetails = detailItems.some(({ key }) => reviewerItems[key]);
          if (hasDetails) {
            children.push(
              new Paragraph({
                text: '详细评审',
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 150, after: 100 },
              })
            );
            
            detailItems.forEach(({ key, label }) => {
              if (reviewerItems[key]) {
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `${label}：`, bold: true }),
                    ],
                    spacing: { before: 80, after: 50 },
                  })
                );
                
                const content = formatExtendedItem(reviewerItems[key]);
                content.split('\n').forEach(line => {
                  children.push(
                    new Paragraph({
                      text: line,
                      indent: { left: 360 },
                      spacing: { after: 50 },
                    })
                  );
                });
              }
            });
          }
        }
      } else if (review.review_content) {
        // 无法解析时显示原始内容
        children.push(
          new Paragraph({
            text: review.review_content.substring(0, 1000) + (review.review_content.length > 1000 ? '...' : ''),
            spacing: { after: 150 },
          })
        );
      }
    });
  }

  // 添加免责声明
  children.push(new Paragraph({ text: '', spacing: { before: 400 } }));
  children.push(new Paragraph({ text: '─'.repeat(50), spacing: { after: 200 } }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: BRAND.disclaimer, italics: true, size: 18, color: '999999' }),
      ],
      spacing: { after: 200 },
    })
  );

  // 创建文档（带页眉页脚）
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${BRAND.name}`, bold: true, size: 20, color: '10a37f' }),
                new TextRun({ text: `  |  ${BRAND.slogan}`, size: 18, color: '999999' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${BRAND.disclaimer}`, size: 16, color: 'aaaaaa' }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: '第 ', size: 18, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '999999' }),
                new TextRun({ text: ' 页，共 ', size: 18, color: '999999' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '999999' }),
                new TextRun({ text: ' 页', size: 18, color: '999999' }),
              ],
            }),
          ],
        }),
      },
      children: children,
    }],
  });

  // 生成并下载
  const blob = await Packer.toBlob(doc);
  const fileName = `审稿报告_${formatDate(task.completed_at)}.docx`;
  saveAs(blob, fileName);
};

/**
 * 导出为 PDF 文档 - 使用 HTML 渲染支持中文
 */
export const exportToPDF = async (task, parsedReport) => {
  // 创建临时 HTML 容器
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 800px;
    padding: 40px;
    padding-top: 60px;
    background: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1f2937;
    line-height: 1.6;
  `;
  
  // 构建 HTML 内容 - 添加水印和页眉
  let html = `
    <!-- 水印层 -->
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; overflow: hidden;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); white-space: nowrap;">
        <span style="font-size: 120px; color: rgba(16, 163, 127, 0.03); font-weight: bold; letter-spacing: 20px;">${BRAND.watermark}</span>
      </div>
    </div>
    
    <!-- 页眉 -->
    <div style="position: absolute; top: 15px; left: 40px; right: 40px; display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">
      <div>
        <span style="font-size: 14px; font-weight: bold; color: #10a37f;">${BRAND.name}</span>
        <span style="font-size: 12px; color: #9ca3af; margin-left: 8px;">${BRAND.slogan}</span>
      </div>
      <div style="font-size: 11px; color: #9ca3af;">审稿报告</div>
    </div>
    
    <!-- 主标题 -->
    <div style="text-align: center; margin-bottom: 30px; margin-top: 20px;">
      <h1 style="font-size: 28px; margin: 0 0 20px; color: #1f2937;">审稿报告</h1>
      <div style="display: inline-block; padding: 8px 20px; background: ${getRecBgColor(task.final_recommendation || task.recommendation)}; color: white; border-radius: 6px; font-weight: 600;">
        ${task.final_recommendation || task.recommendation || '待定'}
      </div>
      ${task.consensus_score > 0 ? `<div style="margin-top: 10px; color: #6b7280;">三审一致性: ${Math.round(task.consensus_score * 100)}%</div>` : ''}
      <div style="margin-top: 10px; color: #9ca3af; font-size: 14px;">生成日期: ${formatDate(task.completed_at || task.created_at)}</div>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
  `;

  // 总体评估
  if (parsedReport?.overall_assessment?.summary) {
    html += `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #1f2937; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #10a37f;">总体评估</h2>
        <p style="margin: 0; color: #4b5563;">${parsedReport.overall_assessment.summary}</p>
      </div>
    `;
  }

  // 关键问题
  if (parsedReport?.critical_issues?.length > 0) {
    html += `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #ef4444; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #ef4444;">关键问题 (${parsedReport.critical_issues.length})</h2>
    `;
    parsedReport.critical_issues.forEach((issue, idx) => {
      const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
      const description = issue.issue_description || issue.description || issue.detail || '';
      const suggestion = issue.required_actions || issue.suggestion || '';
      html += `
        <div style="margin-bottom: 15px; padding: 12px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
          <div style="font-weight: 600; color: #1f2937;">${idx + 1}. ${title}</div>
          ${description ? `<p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">${description}</p>` : ''}
          ${suggestion ? `<p style="margin: 8px 0 0; color: #10a37f; font-size: 14px;"><strong>建议：</strong>${suggestion}</p>` : ''}
        </div>
      `;
    });
    html += `</div>`;
  }

  // 改进建议
  if (parsedReport?.other_suggestions?.length > 0) {
    html += `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #10a37f; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #10a37f;">改进建议 (${parsedReport.other_suggestions.length})</h2>
    `;
    parsedReport.other_suggestions.forEach((sug, idx) => {
      const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
      const description = sug.suggestion_description || sug.description || '';
      html += `
        <div style="margin-bottom: 12px; padding: 10px 12px; background: #f0fdf4; border-left: 4px solid #10a37f; border-radius: 4px;">
          <div style="color: #1f2937;">${idx + 1}. ${title}</div>
          ${description ? `<p style="margin: 6px 0 0; color: #6b7280; font-size: 14px;">${description}</p>` : ''}
        </div>
      `;
    });
    html += `</div>`;
  }

  // 详细评审
  if (parsedReport?.extended_review_items) {
    const items = parsedReport.extended_review_items;
    const reviewItems = [
      { key: 'novelty_evaluation', label: '新颖性评价' },
      { key: 'technical_soundness', label: '技术严谨性' },
      { key: 'clarity_and_presentation', label: '清晰度与呈现' },
      { key: 'reproducibility', label: '可复现性' },
      { key: 'ethical_considerations', label: '伦理考量' },
      { key: 'impact_and_significance', label: '影响力与重要性' },
    ];
    
    html += `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 18px; color: #6366f1; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #6366f1;">详细评审</h2>
    `;
    reviewItems.forEach(({ key, label }) => {
      if (items[key]) {
        const content = formatExtendedItem(items[key]);
        html += `
          <div style="margin-bottom: 15px;">
            <h3 style="font-size: 15px; color: #4b5563; margin: 0 0 8px;">${label}</h3>
            <p style="margin: 0; color: #6b7280; font-size: 14px; white-space: pre-wrap;">${content}</p>
          </div>
        `;
      }
    });
    html += `</div>`;
  }

  // 添加单个审稿人报告
  if (task.reviews && task.reviews.length > 0) {
    html += `
      <div style="page-break-before: always; padding-top: 20px;">
        <h2 style="font-size: 20px; color: #1f2937; margin: 0 0 20px; text-align: center;">各审稿人独立意见</h2>
    `;
    
    task.reviews.forEach((review) => {
      if (review.status !== 'completed') return;
      
      const reviewerLabel = ['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index;
      const reviewerReport = parseReviewerReport(review.review_content);
      
      html += `
        <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #10a37f, #0d8a6a); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px;">${reviewerLabel}</div>
            <div style="margin-left: 12px;">
              <div style="font-size: 16px; font-weight: 600; color: #1f2937;">审稿人 ${reviewerLabel}</div>
              ${review.recommendation ? `<div style="display: inline-block; margin-top: 4px; padding: 2px 10px; background: ${getRecBgColor(review.recommendation)}; color: white; border-radius: 4px; font-size: 12px;">${review.recommendation}</div>` : ''}
            </div>
          </div>
      `;
      
      if (reviewerReport) {
        // 总体评估
        if (reviewerReport.overall_assessment?.summary) {
          html += `
            <div style="margin-bottom: 15px;">
              <h4 style="font-size: 14px; color: #4b5563; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">总体评估</h4>
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">${reviewerReport.overall_assessment.summary}</p>
            </div>
          `;
        }
        
        // 关键问题
        if (reviewerReport.critical_issues?.length > 0) {
          html += `<div style="margin-bottom: 15px;"><h4 style="font-size: 14px; color: #ef4444; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #fecaca;">关键问题 (${reviewerReport.critical_issues.length})</h4>`;
          reviewerReport.critical_issues.forEach((issue, idx) => {
            const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
            const description = issue.issue_description || issue.description || issue.detail || '';
            const suggestion = issue.required_actions || issue.suggestion || '';
            html += `
              <div style="margin-bottom: 10px; padding: 10px; background: #fef2f2; border-radius: 6px;">
                <div style="font-weight: 600; color: #1f2937; font-size: 13px;">${idx + 1}. ${title}</div>
                ${description ? `<p style="margin: 6px 0 0; color: #6b7280; font-size: 12px; line-height: 1.5;">${description}</p>` : ''}
                ${suggestion ? `<p style="margin: 6px 0 0; color: #10a37f; font-size: 12px;"><strong>建议：</strong>${suggestion}</p>` : ''}
              </div>
            `;
          });
          html += `</div>`;
        }
        
        // 改进建议
        if (reviewerReport.other_suggestions?.length > 0) {
          html += `<div style="margin-bottom: 15px;"><h4 style="font-size: 14px; color: #10a37f; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #bbf7d0;">改进建议 (${reviewerReport.other_suggestions.length})</h4>`;
          reviewerReport.other_suggestions.forEach((sug, idx) => {
            const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
            const description = sug.suggestion_description || sug.description || '';
            html += `
              <div style="margin-bottom: 8px; padding: 8px 10px; background: #f0fdf4; border-radius: 6px;">
                <div style="color: #1f2937; font-size: 13px;">${idx + 1}. ${title}</div>
                ${description ? `<p style="margin: 4px 0 0; color: #6b7280; font-size: 12px;">${description}</p>` : ''}
              </div>
            `;
          });
          html += `</div>`;
        }
        
        // 详细评审
        if (reviewerReport.extended_review_items) {
          const reviewerItems = reviewerReport.extended_review_items;
          const detailItems = [
            { key: 'novelty_evaluation', label: '新颖性评价' },
            { key: 'technical_soundness', label: '技术严谨性' },
            { key: 'clarity_and_presentation', label: '清晰度与呈现' },
            { key: 'reproducibility', label: '可复现性' },
            { key: 'ethical_considerations', label: '伦理考量' },
            { key: 'impact_and_significance', label: '影响力与重要性' },
          ];
          
          const hasDetails = detailItems.some(({ key }) => reviewerItems[key]);
          if (hasDetails) {
            html += `<div style="margin-bottom: 15px;"><h4 style="font-size: 14px; color: #6366f1; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #c7d2fe;">详细评审</h4>`;
            detailItems.forEach(({ key, label }) => {
              if (reviewerItems[key]) {
                const content = formatExtendedItem(reviewerItems[key]);
                html += `
                  <div style="margin-bottom: 10px;">
                    <div style="font-weight: 600; color: #4b5563; font-size: 12px; margin-bottom: 4px;">${label}</div>
                    <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; white-space: pre-wrap;">${content}</p>
                  </div>
                `;
              }
            });
            html += `</div>`;
          }
        }
      }
      
      html += `</div>`;
    });
    
    html += `</div>`;
  }

  // 添加免责声明
  html += `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">
        ${BRAND.disclaimer}
      </p>
      <p style="font-size: 10px; color: #d1d5db; text-align: center; margin: 10px 0 0;">
        ${BRAND.name} · ${BRAND.slogan}
      </p>
    </div>
  `;

  // 设置容器内容并添加到 DOM
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // 使用 html2canvas 将 HTML 转换为图片
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // 创建 PDF
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pdfWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // 计算需要多少页
    const pageContentHeight = pdfHeight - margin * 2;
    const totalPages = Math.ceil(imgHeight / pageContentHeight);
    
    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        pdf.addPage();
      }
      
      // 计算当前页的图片位置（负值表示向上偏移）
      const yOffset = margin - (page * pageContentHeight);
      
      // 添加图片，使用裁剪方式
      pdf.addImage(imgData, 'JPEG', margin, yOffset, imgWidth, imgHeight);
      
      // 添加白色遮罩覆盖超出部分（顶部和底部）
      pdf.setFillColor(255, 255, 255);
      if (page > 0) {
        // 遮罩顶部超出部分
        pdf.rect(0, 0, pdfWidth, margin, 'F');
      }
      // 遮罩底部超出部分
      pdf.rect(0, pdfHeight - margin, pdfWidth, margin, 'F');
    }

    // 保存
    const fileName = `审稿报告_${formatDate(task.completed_at).replace(/\//g, '-')}.pdf`;
    pdf.save(fileName);
  } finally {
    // 清理临时元素
    document.body.removeChild(container);
  }
};

// 获取推荐意见背景色
const getRecBgColor = (recommendation) => {
  if (!recommendation) return '#6b7280';
  const lower = recommendation.toLowerCase();
  if (lower.includes('accept')) return '#10a37f';
  if (lower.includes('minor')) return '#3b82f6';
  if (lower.includes('major')) return '#f59e0b';
  if (lower.includes('reject')) return '#ef4444';
  return '#6b7280';
};

/**
 * 导出为 PPT 演示文稿 - 优化样式版本
 */
export const exportToPPT = async (task, parsedReport) => {
  const pptx = new PptxGenJS();
  
  // 设置演示文稿属性
  pptx.author = 'Scholay';
  pptx.title = '审稿报告';
  pptx.subject = 'Peer Review Report';
  pptx.layout = 'LAYOUT_16x9';
  
  // 定义颜色主题
  const colors = {
    primary: '10a37f',
    danger: 'ef4444',
    warning: 'f59e0b',
    info: '3b82f6',
    purple: '6366f1',
    dark: '1f2937',
    darkGray: '374151',
    gray: '6b7280',
    lightGray: '9ca3af',
    light: 'f3f4f6',
    white: 'ffffff',
  };

  // 添加页眉页脚和水印的辅助函数
  const addSlideDecorations = (slide, showWatermark = true) => {
    // 水印（非常淡，需要调低亮度才能看清）
    if (showWatermark) {
      slide.addText(BRAND.watermark, {
        x: 1.5, y: 1.8, w: 7, h: 2,
        fontSize: 60, bold: true, color: 'f5f5f5',
        align: 'center', valign: 'middle',
        rotate: -25,
      });
    }
    
    // 页眉 - 放在右上角，避免与标题重叠
    slide.addText(`${BRAND.name} · ${BRAND.slogan}`, {
      x: 5.5, y: 0.08, w: 4.2, h: 0.22,
      fontSize: 7, color: colors.lightGray,
      align: 'right',
    });
    
    // 页脚装饰线
    slide.addShape('rect', {
      x: 0.3, y: 5.1, w: 9.4, h: 0.015,
      fill: { color: colors.light },
    });
    
    // 页脚 - 免责声明
    slide.addText(BRAND.disclaimer, {
      x: 0.3, y: 5.15, w: 7, h: 0.25,
      fontSize: 6, color: colors.lightGray,
    });
    
    // 页码占位
    slide.addText('', {
      x: 8.5, y: 5.15, w: 1.2, h: 0.25,
      fontSize: 7, color: colors.lightGray,
      align: 'right',
    });
  };
  
  // 旧的辅助函数保留兼容
  const addFooterLine = (slide) => {
    addSlideDecorations(slide);
  };

  // 封面页
  let slide = pptx.addSlide();
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 5.63,
    fill: { color: 'f8fafc' },
  });
  
  // 水印
  slide.addText(BRAND.watermark, {
    x: 1.5, y: 1.5, w: 7, h: 2.5,
    fontSize: 72, bold: true, color: 'f0f0f0',
    align: 'center', valign: 'middle',
    rotate: -25,
  });
  
  // 顶部 Logo
  slide.addText(BRAND.name, {
    x: 0.3, y: 0.3, w: 2, h: 0.4,
    fontSize: 16, bold: true, color: colors.primary,
  });
  slide.addText(BRAND.slogan, {
    x: 0.3, y: 0.7, w: 3, h: 0.3,
    fontSize: 10, color: colors.lightGray,
  });
  
  slide.addShape('rect', {
    x: 0, y: 2.2, w: 0.08, h: 1.2,
    fill: { color: colors.primary },
  });
  slide.addText('审稿报告', {
    x: 0.3, y: 2.2, w: 9.4, h: 0.6,
    fontSize: 32, bold: true, color: colors.dark,
    fontFace: 'Microsoft YaHei',
  });
  slide.addText('Peer Review Report', {
    x: 0.3, y: 2.75, w: 9.4, h: 0.35,
    fontSize: 14, color: colors.lightGray,
  });
  
  // 审稿意见徽章
  const recommendation = task.final_recommendation || task.recommendation || 'Pending';
  const recColor = recommendation.toLowerCase().includes('accept') ? colors.primary :
                   recommendation.toLowerCase().includes('minor') ? colors.info :
                   recommendation.toLowerCase().includes('major') ? colors.warning : colors.danger;
  
  slide.addText(recommendation, {
    x: 0.3, y: 3.4, w: 2.2, h: 0.4,
    fontSize: 12, bold: true, color: colors.white,
    fill: { color: recColor },
    align: 'center',
    valign: 'middle',
  });
  
  if (task.consensus_score > 0) {
    slide.addText(`三审一致性 ${Math.round(task.consensus_score * 100)}%`, {
      x: 2.7, y: 3.4, w: 1.8, h: 0.4,
      fontSize: 11, color: colors.gray,
      valign: 'middle',
    });
  }
  
  slide.addText(`${formatDate(task.completed_at || task.created_at)}`, {
    x: 0.3, y: 4.6, w: 9.4, h: 0.3,
    fontSize: 10, color: colors.lightGray,
  });
  
  // 封面页页脚
  slide.addShape('rect', {
    x: 0.3, y: 5.1, w: 9.4, h: 0.015,
    fill: { color: colors.light },
  });
  slide.addText(BRAND.disclaimer, {
    x: 0.3, y: 5.18, w: 9.4, h: 0.25,
    fontSize: 7, color: colors.lightGray,
    align: 'center',
  });

  // 概览页
  slide = pptx.addSlide();
  addFooterLine(slide);
  slide.addShape('rect', {
    x: 0, y: 0, w: 0.08, h: 0.5,
    fill: { color: colors.primary },
  });
  slide.addText('报告概览', {
    x: 0.3, y: 0.15, w: 9.4, h: 0.4,
    fontSize: 18, bold: true, color: colors.dark,
  });
  
  // 概览卡片
  let cardX = 0.3;
  const cardW = 3;
  const cardH = 1.2;
  const cardY = 0.8;
  
  if (parsedReport?.critical_issues?.length > 0) {
    slide.addShape('rect', {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: 'fef2f2' },
      line: { color: 'fecaca', pt: 1 },
    });
    slide.addText('关键问题', {
      x: cardX + 0.15, y: cardY + 0.15, w: cardW - 0.3, h: 0.3,
      fontSize: 10, color: colors.danger,
    });
    slide.addText(`${parsedReport.critical_issues.length}`, {
      x: cardX + 0.15, y: cardY + 0.5, w: cardW - 0.3, h: 0.5,
      fontSize: 28, bold: true, color: colors.danger,
    });
    cardX += cardW + 0.2;
  }
  
  if (parsedReport?.other_suggestions?.length > 0) {
    slide.addShape('rect', {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: 'f0fdf4' },
      line: { color: 'bbf7d0', pt: 1 },
    });
    slide.addText('改进建议', {
      x: cardX + 0.15, y: cardY + 0.15, w: cardW - 0.3, h: 0.3,
      fontSize: 10, color: colors.primary,
    });
    slide.addText(`${parsedReport.other_suggestions.length}`, {
      x: cardX + 0.15, y: cardY + 0.5, w: cardW - 0.3, h: 0.5,
      fontSize: 28, bold: true, color: colors.primary,
    });
    cardX += cardW + 0.2;
  }
  
  if (task.consensus_score > 0) {
    slide.addShape('rect', {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: 'eff6ff' },
      line: { color: 'bfdbfe', pt: 1 },
    });
    slide.addText('三审一致性', {
      x: cardX + 0.15, y: cardY + 0.15, w: cardW - 0.3, h: 0.3,
      fontSize: 10, color: colors.info,
    });
    slide.addText(`${Math.round(task.consensus_score * 100)}%`, {
      x: cardX + 0.15, y: cardY + 0.5, w: cardW - 0.3, h: 0.5,
      fontSize: 28, bold: true, color: colors.info,
    });
  }
  
  // 总体评估摘要
  if (parsedReport?.overall_assessment?.summary) {
    slide.addText('总体评估', {
      x: 0.3, y: 2.2, w: 9.4, h: 0.3,
      fontSize: 11, bold: true, color: colors.darkGray,
    });
    const summary = parsedReport.overall_assessment.summary;
    slide.addText(summary.substring(0, 350) + (summary.length > 350 ? '...' : ''), {
      x: 0.3, y: 2.55, w: 9.4, h: 2.4,
      fontSize: 10, color: colors.gray,
      valign: 'top',
    });
  }

  // 关键问题页
  if (parsedReport?.critical_issues?.length > 0) {
    slide = pptx.addSlide();
    addFooterLine(slide);
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.08, h: 0.5,
      fill: { color: colors.danger },
    });
    slide.addText(`关键问题 (${parsedReport.critical_issues.length})`, {
      x: 0.3, y: 0.15, w: 9.4, h: 0.4,
      fontSize: 18, bold: true, color: colors.danger,
    });
    
    const issuesPerSlide = 4;
    parsedReport.critical_issues.forEach((issue, idx) => {
      if (idx > 0 && idx % issuesPerSlide === 0) {
        slide = pptx.addSlide();
        addFooterLine(slide);
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 0.5,
          fill: { color: colors.danger },
        });
        slide.addText(`关键问题 (续)`, {
          x: 0.3, y: 0.15, w: 9.4, h: 0.4,
          fontSize: 18, bold: true, color: colors.danger,
        });
      }
      
      const posIdx = idx % issuesPerSlide;
      const yPos = 0.7 + posIdx * 1.1;
      const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
      const description = issue.issue_description || issue.description || issue.detail || '';
      
      // 问题卡片背景
      slide.addShape('rect', {
        x: 0.3, y: yPos, w: 9.4, h: 1,
        fill: { color: 'fef2f2' },
        line: { color: 'fecaca', pt: 0.5 },
      });
      
      // 序号
      slide.addShape('rect', {
        x: 0.4, y: yPos + 0.1, w: 0.35, h: 0.35,
        fill: { color: colors.danger },
      });
      slide.addText(`${idx + 1}`, {
        x: 0.4, y: yPos + 0.1, w: 0.35, h: 0.35,
        fontSize: 10, bold: true, color: colors.white,
        align: 'center', valign: 'middle',
      });
      
      // 标题
      slide.addText(title, {
        x: 0.85, y: yPos + 0.1, w: 8.75, h: 0.35,
        fontSize: 11, bold: true, color: colors.dark,
        valign: 'middle',
      });
      
      // 描述
      if (description) {
        slide.addText(description.substring(0, 180) + (description.length > 180 ? '...' : ''), {
          x: 0.85, y: yPos + 0.5, w: 8.75, h: 0.45,
          fontSize: 9, color: colors.gray,
          valign: 'top',
        });
      }
    });
  }

  // 改进建议页
  if (parsedReport?.other_suggestions?.length > 0) {
    slide = pptx.addSlide();
    addFooterLine(slide);
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.08, h: 0.5,
      fill: { color: colors.primary },
    });
    slide.addText(`改进建议 (${parsedReport.other_suggestions.length})`, {
      x: 0.3, y: 0.15, w: 9.4, h: 0.4,
      fontSize: 18, bold: true, color: colors.primary,
    });
    
    const sugPerSlide = 5;
    parsedReport.other_suggestions.forEach((sug, idx) => {
      if (idx > 0 && idx % sugPerSlide === 0) {
        slide = pptx.addSlide();
        addFooterLine(slide);
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 0.5,
          fill: { color: colors.primary },
        });
        slide.addText(`改进建议 (续)`, {
          x: 0.3, y: 0.15, w: 9.4, h: 0.4,
          fontSize: 18, bold: true, color: colors.primary,
        });
      }
      
      const posIdx = idx % sugPerSlide;
      const yPos = 0.7 + posIdx * 0.85;
      const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
      
      // 建议卡片背景
      slide.addShape('rect', {
        x: 0.3, y: yPos, w: 9.4, h: 0.75,
        fill: { color: 'f0fdf4' },
        line: { color: 'bbf7d0', pt: 0.5 },
      });
      
      // 序号
      slide.addShape('rect', {
        x: 0.4, y: yPos + 0.2, w: 0.35, h: 0.35,
        fill: { color: colors.primary },
      });
      slide.addText(`${idx + 1}`, {
        x: 0.4, y: yPos + 0.2, w: 0.35, h: 0.35,
        fontSize: 10, bold: true, color: colors.white,
        align: 'center', valign: 'middle',
      });
      
      // 标题
      slide.addText(title.substring(0, 120) + (title.length > 120 ? '...' : ''), {
        x: 0.85, y: yPos + 0.1, w: 8.75, h: 0.55,
        fontSize: 10, color: colors.dark,
        valign: 'middle',
      });
    });
  }

  // 详细评审页
  if (parsedReport?.extended_review_items) {
    slide = pptx.addSlide();
    addFooterLine(slide);
    slide.addShape('rect', {
      x: 0, y: 0, w: 0.08, h: 0.5,
      fill: { color: colors.purple },
    });
    slide.addText('详细评审', {
      x: 0.3, y: 0.15, w: 9.4, h: 0.4,
      fontSize: 18, bold: true, color: colors.purple,
    });
    
    const items = parsedReport.extended_review_items;
    const reviewItems = [
      { key: 'novelty_evaluation', label: '新颖性评价' },
      { key: 'technical_soundness', label: '技术严谨性' },
      { key: 'clarity_and_presentation', label: '清晰度与呈现' },
      { key: 'reproducibility', label: '可复现性' },
      { key: 'impact_and_significance', label: '影响力与重要性' },
    ];
    
    let itemIdx = 0;
    reviewItems.forEach(({ key, label }) => {
      if (items[key]) {
        if (itemIdx > 0 && itemIdx % 3 === 0) {
          slide = pptx.addSlide();
          addFooterLine(slide);
          slide.addShape('rect', {
            x: 0, y: 0, w: 0.08, h: 0.5,
            fill: { color: colors.purple },
          });
          slide.addText('详细评审 (续)', {
            x: 0.3, y: 0.15, w: 9.4, h: 0.4,
            fontSize: 18, bold: true, color: colors.purple,
          });
        }
        
        const posIdx = itemIdx % 3;
        const yPos = 0.7 + posIdx * 1.45;
        
        // 评审项背景
        slide.addShape('rect', {
          x: 0.3, y: yPos, w: 9.4, h: 1.35,
          fill: { color: 'f5f3ff' },
          line: { color: 'ddd6fe', pt: 0.5 },
        });
        
        // 标签
        slide.addText(label, {
          x: 0.4, y: yPos + 0.1, w: 9.2, h: 0.3,
          fontSize: 11, bold: true, color: colors.purple,
        });
        
        const content = formatExtendedItem(items[key]);
        slide.addText(content.substring(0, 280) + (content.length > 280 ? '...' : ''), {
          x: 0.4, y: yPos + 0.45, w: 9.2, h: 0.85,
          fontSize: 9, color: colors.gray,
          valign: 'top',
        });
        
        itemIdx++;
      }
    });
  }

  // 添加单个审稿人报告
  if (task.reviews && task.reviews.length > 0) {
    // 审稿人报告分隔页
    slide = pptx.addSlide();
    slide.addShape('rect', {
      x: 0, y: 0, w: 10, h: 5.63,
      fill: { color: 'f8fafc' },
    });
    // 添加页眉页脚和水印
    addSlideDecorations(slide, true);
    slide.addShape('rect', {
      x: 4.5, y: 2.3, w: 1, h: 0.04,
      fill: { color: colors.primary },
    });
    slide.addText('各审稿人独立意见', {
      x: 0.3, y: 2.5, w: 9.4, h: 0.5,
      fontSize: 24, bold: true, color: colors.dark,
      align: 'center',
    });
    slide.addText('Individual Reviewer Reports', {
      x: 0.3, y: 3, w: 9.4, h: 0.3,
      fontSize: 12, color: colors.lightGray,
      align: 'center',
    });
    
    task.reviews.forEach((review, reviewIdx) => {
      if (review.status !== 'completed') return;
      
      const reviewerLabel = ['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index;
      const reviewerReport = parseReviewerReport(review.review_content);
      
      // 审稿人概览页
      slide = pptx.addSlide();
      addFooterLine(slide);
      
      const recColor = review.recommendation?.toLowerCase().includes('accept') ? colors.primary :
                       review.recommendation?.toLowerCase().includes('minor') ? colors.info :
                       review.recommendation?.toLowerCase().includes('major') ? colors.warning : colors.danger;
      
      // 左侧装饰条
      slide.addShape('rect', {
        x: 0, y: 0, w: 0.08, h: 0.5,
        fill: { color: recColor },
      });
      
      // 审稿人头像
      slide.addShape('ellipse', {
        x: 0.3, y: 0.15, w: 0.5, h: 0.5,
        fill: { color: colors.primary },
      });
      slide.addText(reviewerLabel, {
        x: 0.3, y: 0.15, w: 0.5, h: 0.5,
        fontSize: 14, bold: true, color: colors.white,
        align: 'center', valign: 'middle',
      });
      
      // 审稿人标题
      slide.addText(`审稿人 ${reviewerLabel}`, {
        x: 0.9, y: 0.15, w: 4, h: 0.3,
        fontSize: 16, bold: true, color: colors.dark,
      });
      
      // 审稿意见徽章
      if (review.recommendation) {
        slide.addText(review.recommendation, {
          x: 0.9, y: 0.45, w: 1.8, h: 0.28,
          fontSize: 9, bold: true, color: colors.white,
          fill: { color: recColor },
          align: 'center', valign: 'middle',
        });
      }
      
      if (reviewerReport) {
        // 总体评估
        if (reviewerReport.overall_assessment?.summary) {
          slide.addText('总体评估', {
            x: 0.3, y: 0.9, w: 9.4, h: 0.25,
            fontSize: 10, bold: true, color: colors.darkGray,
          });
          
          const summary = reviewerReport.overall_assessment.summary;
          slide.addText(summary.substring(0, 300) + (summary.length > 300 ? '...' : ''), {
            x: 0.3, y: 1.18, w: 9.4, h: 1.1,
            fontSize: 9, color: colors.gray,
            valign: 'top',
          });
        }
        
        // 统计卡片
        let statX = 0.3;
        if (reviewerReport.critical_issues?.length > 0) {
          slide.addShape('rect', {
            x: statX, y: 2.4, w: 2.2, h: 0.7,
            fill: { color: 'fef2f2' },
            line: { color: 'fecaca', pt: 0.5 },
          });
          slide.addText('关键问题', {
            x: statX + 0.1, y: 2.45, w: 2, h: 0.25,
            fontSize: 9, color: colors.danger,
          });
          slide.addText(`${reviewerReport.critical_issues.length}`, {
            x: statX + 0.1, y: 2.7, w: 2, h: 0.35,
            fontSize: 18, bold: true, color: colors.danger,
          });
          statX += 2.4;
        }
        
        if (reviewerReport.other_suggestions?.length > 0) {
          slide.addShape('rect', {
            x: statX, y: 2.4, w: 2.2, h: 0.7,
            fill: { color: 'f0fdf4' },
            line: { color: 'bbf7d0', pt: 0.5 },
          });
          slide.addText('改进建议', {
            x: statX + 0.1, y: 2.45, w: 2, h: 0.25,
            fontSize: 9, color: colors.primary,
          });
          slide.addText(`${reviewerReport.other_suggestions.length}`, {
            x: statX + 0.1, y: 2.7, w: 2, h: 0.35,
            fontSize: 18, bold: true, color: colors.primary,
          });
        }
        
        // 关键问题详情页
        if (reviewerReport.critical_issues?.length > 0) {
          slide = pptx.addSlide();
          addFooterLine(slide);
          slide.addShape('rect', {
            x: 0, y: 0, w: 0.08, h: 0.5,
            fill: { color: colors.danger },
          });
          slide.addText(`审稿人 ${reviewerLabel} · 关键问题`, {
            x: 0.3, y: 0.15, w: 9.4, h: 0.4,
            fontSize: 14, bold: true, color: colors.danger,
          });
          
          const issuesPerSlide = 4;
          reviewerReport.critical_issues.forEach((issue, idx) => {
            if (idx > 0 && idx % issuesPerSlide === 0) {
              slide = pptx.addSlide();
              addFooterLine(slide);
              slide.addShape('rect', {
                x: 0, y: 0, w: 0.08, h: 0.5,
                fill: { color: colors.danger },
              });
              slide.addText(`审稿人 ${reviewerLabel} · 关键问题 (续)`, {
                x: 0.3, y: 0.15, w: 9.4, h: 0.4,
                fontSize: 14, bold: true, color: colors.danger,
              });
            }
            
            const posIdx = idx % issuesPerSlide;
            const issueY = 0.7 + posIdx * 1.1;
            const title = issue.issue_title || issue.issue || issue.title || `问题 ${idx + 1}`;
            const description = issue.issue_description || issue.description || issue.detail || '';
            
            // 问题卡片
            slide.addShape('rect', {
              x: 0.3, y: issueY, w: 9.4, h: 1,
              fill: { color: 'fef2f2' },
              line: { color: 'fecaca', pt: 0.5 },
            });
            slide.addShape('rect', {
              x: 0.4, y: issueY + 0.1, w: 0.3, h: 0.3,
              fill: { color: colors.danger },
            });
            slide.addText(`${idx + 1}`, {
              x: 0.4, y: issueY + 0.1, w: 0.3, h: 0.3,
              fontSize: 9, bold: true, color: colors.white,
              align: 'center', valign: 'middle',
            });
            slide.addText(title, {
              x: 0.8, y: issueY + 0.1, w: 8.8, h: 0.3,
              fontSize: 10, bold: true, color: colors.dark,
              valign: 'middle',
            });
            if (description) {
              slide.addText(description.substring(0, 160) + (description.length > 160 ? '...' : ''), {
                x: 0.8, y: issueY + 0.45, w: 8.8, h: 0.5,
                fontSize: 8, color: colors.gray,
                valign: 'top',
              });
            }
          });
        }
        
        // 改进建议详情页
        if (reviewerReport.other_suggestions?.length > 0) {
          slide = pptx.addSlide();
          addFooterLine(slide);
          slide.addShape('rect', {
            x: 0, y: 0, w: 0.08, h: 0.5,
            fill: { color: colors.primary },
          });
          slide.addText(`审稿人 ${reviewerLabel} · 改进建议`, {
            x: 0.3, y: 0.15, w: 9.4, h: 0.4,
            fontSize: 14, bold: true, color: colors.primary,
          });
          
          const sugPerSlide = 5;
          reviewerReport.other_suggestions.forEach((sug, idx) => {
            if (idx > 0 && idx % sugPerSlide === 0) {
              slide = pptx.addSlide();
              addFooterLine(slide);
              slide.addShape('rect', {
                x: 0, y: 0, w: 0.08, h: 0.5,
                fill: { color: colors.primary },
              });
              slide.addText(`审稿人 ${reviewerLabel} · 改进建议 (续)`, {
                x: 0.3, y: 0.15, w: 9.4, h: 0.4,
                fontSize: 14, bold: true, color: colors.primary,
              });
            }
            
            const posIdx = idx % sugPerSlide;
            const sugY = 0.7 + posIdx * 0.85;
            const title = sug.suggestion_title || sug.suggestion || sug.title || `建议 ${idx + 1}`;
            
            // 建议卡片
            slide.addShape('rect', {
              x: 0.3, y: sugY, w: 9.4, h: 0.75,
              fill: { color: 'f0fdf4' },
              line: { color: 'bbf7d0', pt: 0.5 },
            });
            slide.addShape('rect', {
              x: 0.4, y: sugY + 0.2, w: 0.3, h: 0.3,
              fill: { color: colors.primary },
            });
            slide.addText(`${idx + 1}`, {
              x: 0.4, y: sugY + 0.2, w: 0.3, h: 0.3,
              fontSize: 9, bold: true, color: colors.white,
              align: 'center', valign: 'middle',
            });
            slide.addText(title.substring(0, 100) + (title.length > 100 ? '...' : ''), {
              x: 0.8, y: sugY + 0.1, w: 8.8, h: 0.55,
              fontSize: 9, color: colors.dark,
              valign: 'middle',
            });
          });
        }
      }
    });
  }

  // 结束页
  slide = pptx.addSlide();
  slide.addShape('rect', {
    x: 0, y: 0, w: 10, h: 5.63,
    fill: { color: 'f8fafc' },
  });
  
  // 水印
  slide.addText(BRAND.watermark, {
    x: 1.5, y: 1.5, w: 7, h: 2.5,
    fontSize: 72, bold: true, color: 'f0f0f0',
    align: 'center', valign: 'middle',
    rotate: -25,
  });
  
  slide.addShape('rect', {
    x: 4.5, y: 2.2, w: 1, h: 0.04,
    fill: { color: colors.primary },
  });
  slide.addText('感谢阅读', {
    x: 0.3, y: 2.4, w: 9.4, h: 0.5,
    fontSize: 24, bold: true, color: colors.dark,
    align: 'center',
  });
  slide.addText('Thank You', {
    x: 0.3, y: 2.9, w: 9.4, h: 0.3,
    fontSize: 12, color: colors.lightGray,
    align: 'center',
  });
  
  // 品牌信息
  slide.addText(BRAND.name, {
    x: 0.3, y: 3.8, w: 9.4, h: 0.4,
    fontSize: 16, bold: true, color: colors.primary,
    align: 'center',
  });
  slide.addText(BRAND.slogan, {
    x: 0.3, y: 4.2, w: 9.4, h: 0.3,
    fontSize: 11, color: colors.gray,
    align: 'center',
  });
  
  // 页脚
  slide.addShape('rect', {
    x: 0.3, y: 5.1, w: 9.4, h: 0.015,
    fill: { color: colors.light },
  });
  slide.addText(BRAND.disclaimer, {
    x: 0.3, y: 5.18, w: 9.4, h: 0.25,
    fontSize: 7, color: colors.lightGray,
    align: 'center',
  });

  // 保存
  const fileName = `审稿报告_${formatDate(task.completed_at).replace(/\//g, '-')}.pptx`;
  await pptx.writeFile({ fileName });
};

export default {
  exportToWord,
  exportToPDF,
  exportToPPT,
};

