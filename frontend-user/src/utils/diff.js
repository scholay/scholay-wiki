/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Diff 算法工具函数
 */

/**
 * 计算 LCS (最长公共子序列) 索引对
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @returns {Array<[number, number]>}
 */
export function computeLCS(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const result = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return result;
}

/**
 * 基于 LCS 的精确 diff 算法
 * 返回每行的变更类型、新旧行号、内容
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{type: 'added'|'removed'|'unchanged', oldLineNum: number|null, newLineNum: number|null, content: string}>}
 */
export function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const result = [];
  let oldIndex = 0;
  let newIndex = 0;
  
  const lcs = computeLCS(oldLines, newLines);
  let lcsIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length) {
      const [lcsOldIdx, lcsNewIdx] = lcs[lcsIndex];
      
      while (oldIndex < lcsOldIdx) {
        result.push({
          type: 'removed',
          oldLineNum: oldIndex + 1,
          newLineNum: null,
          content: oldLines[oldIndex],
        });
        oldIndex++;
      }
      
      while (newIndex < lcsNewIdx) {
        result.push({
          type: 'added',
          oldLineNum: null,
          newLineNum: newIndex + 1,
          content: newLines[newIndex],
        });
        newIndex++;
      }
      
      result.push({
        type: 'unchanged',
        oldLineNum: oldIndex + 1,
        newLineNum: newIndex + 1,
        content: oldLines[oldIndex],
      });
      oldIndex++;
      newIndex++;
      lcsIndex++;
    } else {
      while (oldIndex < oldLines.length) {
        result.push({
          type: 'removed',
          oldLineNum: oldIndex + 1,
          newLineNum: null,
          content: oldLines[oldIndex],
        });
        oldIndex++;
      }
      
      while (newIndex < newLines.length) {
        result.push({
          type: 'added',
          oldLineNum: null,
          newLineNum: newIndex + 1,
          content: newLines[newIndex],
        });
        newIndex++;
      }
    }
  }
  
  return result;
}

/**
 * 简单的贪心 diff 算法（适用于模态对话框的统一视图）
 * 返回 'add'|'remove'|'same' 类型行
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{type: 'add'|'remove'|'same', content: string, lineNumber: number}>}
 */
export function computeSimpleDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];
  
  let i = 0, j = 0;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
      j++;
    } else if (j >= newLines.length) {
      result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
      i++;
    } else if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', content: oldLines[i], lineNumber: i + 1 });
      i++;
      j++;
    } else {
      let foundInNew = newLines.slice(j).indexOf(oldLines[i]);
      let foundInOld = oldLines.slice(i).indexOf(newLines[j]);
      
      if (foundInNew === -1 && foundInOld === -1) {
        result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
        result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
        i++;
        j++;
      } else if (foundInNew === -1 || (foundInOld !== -1 && foundInOld < foundInNew)) {
        result.push({ type: 'add', content: newLines[j], lineNumber: j + 1 });
        j++;
      } else {
        result.push({ type: 'remove', content: oldLines[i], lineNumber: i + 1 });
        i++;
      }
    }
  }
  
  return result;
}
