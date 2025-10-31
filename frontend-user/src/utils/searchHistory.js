// 搜索历史管理工具
const SEARCH_HISTORY_KEY = 'scholar_search_history';
const MAX_HISTORY_ITEMS = 50; // 最多保存50条历史记录

// 搜索历史项目结构:
// {
//   id: number,
//   query: string,
//   filters: object, // 包含所有搜索过滤条件
//   timestamp: number,
//   resultsCount: number (optional)
// }

/**
 * 获取所有搜索历史
 * @returns {Array} 搜索历史数组,按时间倒序排列
 */
export const getSearchHistory = () => {
  try {
    const historyJson = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!historyJson) return [];

    const history = JSON.parse(historyJson);
    // 按时间戳倒序排列(最新的在前)
    return history.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get search history:', error);
    return [];
  }
};

/**
 * 添加搜索历史记录
 * @param {string} query - 搜索关键词
 * @param {object} filters - 搜索过滤条件
 * @param {number} resultsCount - 搜索结果数量(可选)
 * @returns {object} 新添加的历史记录项
 */
export const addSearchHistory = (query, filters = {}, resultsCount = null) => {
  if (!query || query.trim() === '') {
    return null;
  }

  try {
    const history = getSearchHistory();

    // 检查是否已存在相同的搜索(query和主要filters相同)
    const existingIndex = history.findIndex(item =>
      item.query === query &&
      JSON.stringify(item.filters) === JSON.stringify(filters)
    );

    let newItem;

    if (existingIndex !== -1) {
      // 如果已存在,更新时间戳并移到最前面
      newItem = {
        ...history[existingIndex],
        timestamp: Date.now(),
        resultsCount: resultsCount !== null ? resultsCount : history[existingIndex].resultsCount
      };
      history.splice(existingIndex, 1);
    } else {
      // 创建新项目
      newItem = {
        id: Date.now(),
        query: query.trim(),
        filters: filters || {},
        timestamp: Date.now(),
        resultsCount
      };
    }

    // 添加到数组开头
    history.unshift(newItem);

    // 保持最大数量限制
    if (history.length > MAX_HISTORY_ITEMS) {
      history.splice(MAX_HISTORY_ITEMS);
    }

    // 保存到localStorage
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));

    return newItem;
  } catch (error) {
    console.error('Failed to add search history:', error);
    return null;
  }
};

/**
 * 删除搜索历史记录
 * @param {number} id - 历史记录ID
 * @returns {boolean} 是否删除成功
 */
export const deleteSearchHistory = (id) => {
  try {
    const history = getSearchHistory();
    const filteredHistory = history.filter(item => item.id !== id);

    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filteredHistory));
    return true;
  } catch (error) {
    console.error('Failed to delete search history:', error);
    return false;
  }
};

/**
 * 清空所有搜索历史
 * @returns {boolean} 是否清空成功
 */
export const clearSearchHistory = () => {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear search history:', error);
    return false;
  }
};

/**
 * 格式化历史记录用于显示
 * @param {object} item - 历史记录项
 * @returns {object} 格式化后的对象,包含title和updated_at
 */
export const formatHistoryItem = (item) => {
  let title = item.query;

  // 添加过滤条件到标题(可选)
  const filterParts = [];

  if (item.filters?.year) {
    filterParts.push(`年份: ${item.filters.year}`);
  }

  if (item.filters?.publicationTypes && item.filters.publicationTypes.length > 0) {
    filterParts.push(`类型: ${item.filters.publicationTypes.length}项`);
  }

  if (item.filters?.fieldsOfStudy && item.filters.fieldsOfStudy.length > 0) {
    filterParts.push(`领域: ${item.filters.fieldsOfStudy.length}项`);
  }

  if (filterParts.length > 0) {
    title = `${item.query} (${filterParts.join(', ')})`;
  }

  if (item.resultsCount !== null && item.resultsCount !== undefined) {
    title = `${title} - ${item.resultsCount}条结果`;
  }

  return {
    id: item.id,
    title: title,
    query: item.query,
    filters: item.filters,
    updated_at: new Date(item.timestamp).toISOString(),
    resultsCount: item.resultsCount
  };
};

/**
 * 获取格式化的搜索历史(用于侧边栏显示)
 * @returns {Array} 格式化后的历史记录数组
 */
export const getFormattedSearchHistory = () => {
  const history = getSearchHistory();
  return history.map(formatHistoryItem);
};
