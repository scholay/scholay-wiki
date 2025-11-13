// 搜索历史管理工具
const SEARCH_HISTORY_KEY_PREFIX = 'scholar_search_history';
const MAX_HISTORY_ITEMS = 50; // 最多保存50条历史记录

/**
 * 获取用户特定的localStorage键名
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {string} localStorage键名
 */
const getUserHistoryKey = (userId) => {
  return userId ? `${SEARCH_HISTORY_KEY_PREFIX}_${userId}` : `${SEARCH_HISTORY_KEY_PREFIX}_guest`;
};

// 搜索历史项目结构:
// {
//   id: number,
//   query: string,           // 实际的搜索查询词（不可变，用于搜索）
//   displayName: string,     // 显示名称（可重命名，用于界面显示）
//   filters: object,         // 包含所有搜索过滤条件
//   timestamp: number,
//   resultsCount: number (optional)
// }

/**
 * 获取指定用户的所有搜索历史
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {Array} 搜索历史数组,按时间倒序排列
 */
export const getSearchHistory = (userId = null) => {
  try {
    const historyKey = getUserHistoryKey(userId);
    const historyJson = localStorage.getItem(historyKey);
    if (!historyJson) return [];

    const history = JSON.parse(historyJson);

    // 迁移旧数据：为没有displayName的项目添加displayName字段
    let needsSave = false;
    history.forEach(item => {
      if (!item.displayName) {
        item.displayName = item.query;
        needsSave = true;
      }
    });

    // 如果有数据被迁移，保存回localStorage
    if (needsSave) {
      localStorage.setItem(historyKey, JSON.stringify(history));
    }

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
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {object} 新添加的历史记录项
 */
export const addSearchHistory = (query, filters = {}, resultsCount = null, userId = null) => {
  if (!query || query.trim() === '') {
    return null;
  }

  try {
    const historyKey = getUserHistoryKey(userId);
    const history = getSearchHistory(userId);

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
        displayName: query.trim(), // 初始时显示名称和查询词相同
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
    localStorage.setItem(historyKey, JSON.stringify(history));

    return newItem;
  } catch (error) {
    console.error('Failed to add search history:', error);
    return null;
  }
};

/**
 * 重命名搜索历史记录 (只更新displayName字段，不改变实际的query)
 * @param {number} id - 历史记录ID
 * @param {string} newDisplayName - 新的显示名称
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {boolean} 是否重命名成功
 */
export const renameSearchHistory = (id, newDisplayName, userId = null) => {
  if (!newDisplayName || newDisplayName.trim() === '') {
    return false;
  }

  try {
    const historyKey = getUserHistoryKey(userId);
    const history = getSearchHistory(userId);
    const itemIndex = history.findIndex(item => item.id === id);

    if (itemIndex !== -1) {
      // 只更新displayName，保持query不变
      history[itemIndex].displayName = newDisplayName.trim();
      localStorage.setItem(historyKey, JSON.stringify(history));
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to rename search history:', error);
    return false;
  }
};

/**
 * 删除搜索历史记录
 * @param {number} id - 历史记录ID
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {boolean} 是否删除成功
 */
export const deleteSearchHistory = (id, userId = null) => {
  try {
    const historyKey = getUserHistoryKey(userId);
    const history = getSearchHistory(userId);
    const filteredHistory = history.filter(item => item.id !== id);

    localStorage.setItem(historyKey, JSON.stringify(filteredHistory));
    return true;
  } catch (error) {
    console.error('Failed to delete search history:', error);
    return false;
  }
};

/**
 * 清空指定用户的所有搜索历史
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {boolean} 是否清空成功
 */
export const clearSearchHistory = (userId = null) => {
  try {
    const historyKey = getUserHistoryKey(userId);
    localStorage.removeItem(historyKey);
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
  // 使用displayName作为基础标题，如果不存在则使用query（兼容旧数据）
  let title = item.displayName || item.query;

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
    title = `${item.displayName || item.query} (${filterParts.join(', ')})`;
  }

  if (item.resultsCount !== null && item.resultsCount !== undefined) {
    title = `${title} - ${item.resultsCount}条结果`;
  }

  return {
    id: item.id,
    title: title,
    query: item.query,              // 实际查询词，用于搜索
    displayName: item.displayName || item.query,  // 显示名称，用于界面展示
    filters: item.filters,
    updated_at: new Date(item.timestamp).toISOString(),
    resultsCount: item.resultsCount
  };
};

/**
 * 获取格式化的搜索历史(用于侧边栏显示)
 * @param {number|null} userId - 用户ID (null表示游客用户)
 * @returns {Array} 格式化后的历史记录数组
 */
export const getFormattedSearchHistory = (userId = null) => {
  const history = getSearchHistory(userId);
  return history.map(formatHistoryItem);
};

/**
 * 迁移旧的搜索历史数据到新的用户特定格式
 * 仅在用户首次使用新系统时调用一次
 * @param {number} userId - 当前用户ID
 */
export const migrateOldSearchHistory = (userId) => {
  try {
    const oldKey = 'scholar_search_history';
    const newKey = getUserHistoryKey(userId);

    // 如果用户已有新格式的历史数据，不进行迁移
    if (localStorage.getItem(newKey)) {
      return;
    }

    // 获取旧格式的历史数据
    const oldHistoryJson = localStorage.getItem(oldKey);
    if (oldHistoryJson) {
      // 将旧数据复制到新的用户特定key
      localStorage.setItem(newKey, oldHistoryJson);
      console.log(`Migrated search history for user ${userId}`);
    }
  } catch (error) {
    console.error('Failed to migrate search history:', error);
  }
};
