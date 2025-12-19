/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 懒加载导出工具
 * 按需加载大型库以减少初始包大小
 */

// 品牌信息
const BRAND = {
  name: 'Scholay',
  slogan: '科研者的瑞士军刀',
  disclaimer: '免责声明：本报告由AI生成，建议仅供参考，不构成最终学术评价意见。',
  watermark: 'scholay.com',
  website: 'scholar.ai',
};

// 懒加载 docx 库
const loadDocx = async () => {
  const docx = await import('docx');
  return docx;
};

// 懒加载 jsPDF 库
const loadJsPDF = async () => {
  const { default: jsPDF } = await import('jspdf');
  return jsPDF;
};

// 懒加载 html2canvas 库
const loadHtml2Canvas = async () => {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas;
};

// 懒加载 pptxgenjs 库
const loadPptxGenJS = async () => {
  const { default: PptxGenJS } = await import('pptxgenjs');
  return PptxGenJS;
};

// 懒加载 file-saver 库
const loadFileSaver = async () => {
  const { saveAs } = await import('file-saver');
  return saveAs;
};

/**
 * 导出为 Word 文档
 * @param {Object} report - 报告数据
 * @param {string} filename - 文件名
 */
export const exportToWord = async (report, filename = 'review-report.docx') => {
  try {
    const docx = await loadDocx();
    const saveAs = await loadFileSaver();
    
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    
    // 创建文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: report.title || '审稿报告',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `生成时间：${new Date().toLocaleString('zh-CN')}`,
                size: 20,
                color: '666666',
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: BRAND.disclaimer,
                italics: true,
                size: 18,
                color: '999999',
              }),
            ],
          }),
          // 添加报告内容...
          ...(report.sections || []).map(section => [
            new Paragraph({
              text: section.title,
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              text: section.content,
            }),
          ]).flat(),
        ],
      }],
    });
    
    // 生成并下载
    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
    
    return { success: true };
  } catch (error) {
    console.error('Word 导出失败:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 导出为 PDF
 * @param {HTMLElement} element - 要导出的 DOM 元素
 * @param {string} filename - 文件名
 */
export const exportToPDF = async (element, filename = 'review-report.pdf') => {
  try {
    const jsPDF = await loadJsPDF();
    const html2canvas = await loadHtml2Canvas();
    
    // 使用 html2canvas 将元素转换为图片
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 宽度 (mm)
    const pageHeight = 297; // A4 高度 (mm)
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;
    
    // 添加第一页
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    // 添加更多页面（如果需要）
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // 添加水印
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text(BRAND.watermark, imgWidth - 30, pageHeight - 10);
    }
    
    pdf.save(filename);
    
    return { success: true };
  } catch (error) {
    console.error('PDF 导出失败:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 导出为 PPT
 * @param {Object} report - 报告数据
 * @param {string} filename - 文件名
 */
export const exportToPPT = async (report, filename = 'review-report.pptx') => {
  try {
    const PptxGenJS = await loadPptxGenJS();
    
    const pptx = new PptxGenJS();
    pptx.author = BRAND.name;
    pptx.title = report.title || '审稿报告';
    
    // 添加标题幻灯片
    const titleSlide = pptx.addSlide();
    titleSlide.addText(report.title || '审稿报告', {
      x: 0.5,
      y: 2,
      w: '90%',
      h: 1,
      fontSize: 36,
      bold: true,
      align: 'center',
    });
    titleSlide.addText(`${BRAND.name} - ${BRAND.slogan}`, {
      x: 0.5,
      y: 4,
      w: '90%',
      h: 0.5,
      fontSize: 14,
      color: '666666',
      align: 'center',
    });
    
    // 添加内容幻灯片
    (report.sections || []).forEach(section => {
      const slide = pptx.addSlide();
      slide.addText(section.title, {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: 0.8,
        fontSize: 24,
        bold: true,
      });
      slide.addText(section.content, {
        x: 0.5,
        y: 1.5,
        w: '90%',
        h: 4,
        fontSize: 14,
        valign: 'top',
      });
    });
    
    // 添加免责声明幻灯片
    const disclaimerSlide = pptx.addSlide();
    disclaimerSlide.addText(BRAND.disclaimer, {
      x: 0.5,
      y: 2.5,
      w: '90%',
      h: 1,
      fontSize: 12,
      color: '999999',
      align: 'center',
      italic: true,
    });
    
    // 保存文件
    await pptx.writeFile({ fileName: filename });
    
    return { success: true };
  } catch (error) {
    console.error('PPT 导出失败:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 检查导出库是否可用
 */
export const checkExportLibraries = async () => {
  const results = {
    docx: false,
    jspdf: false,
    html2canvas: false,
    pptxgenjs: false,
  };
  
  try {
    await loadDocx();
    results.docx = true;
  } catch (e) { /* ignore */ }
  
  try {
    await loadJsPDF();
    results.jspdf = true;
  } catch (e) { /* ignore */ }
  
  try {
    await loadHtml2Canvas();
    results.html2canvas = true;
  } catch (e) { /* ignore */ }
  
  try {
    await loadPptxGenJS();
    results.pptxgenjs = true;
  } catch (e) { /* ignore */ }
  
  return results;
};

export default {
  exportToWord,
  exportToPDF,
  exportToPPT,
  checkExportLibraries,
};

