/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * messageUtils - 消息处理工具函数
 */

/**
 * 根据 parent_message_id 组织消息顺序
 * @param {Array} messages - 消息数组
 * @returns {Array} 组织后的消息数组
 */
export const organizeMessagesByParentId = (messages) => {
  if (!messages || messages.length === 0) return [];
  
  // 检查是否有消息包含parent_message_id
  const hasParentIds = messages.some(m => m.parent_message_id);
  
  // 如果没有parent_message_id，使用原始顺序（向后兼容旧数据）
  if (!hasParentIds) {
    return messages;
  }
  
  // 构建消息映射
  const messageMap = {};
  messages.forEach(msg => {
    messageMap[msg.message_id] = msg;
  });
  
  // 找到所有根消息（用户消息且没有parent_message_id的）
  const rootMessages = messages.filter(m => m.role === 'user' && !m.parent_message_id);
  
  // 构建有序的消息列表
  const organized = [];
  const processedIds = new Set();
  
  // 对每个根消息，递归添加其子消息
  const addMessageAndChildren = (msg) => {
    if (processedIds.has(msg.id)) return;
    
    organized.push(msg);
    processedIds.add(msg.id);
    
    // 查找以当前消息为parent的子消息
    const children = messages.filter(m => 
      m.parent_message_id === msg.message_id && !processedIds.has(m.id)
    );
    
    // 按时间排序子消息
    children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    children.forEach(child => {
      addMessageAndChildren(child);
    });
  };
  
  // 按时间排序根消息
  rootMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  // 处理所有根消息
  rootMessages.forEach(rootMsg => {
    addMessageAndChildren(rootMsg);
  });
  
  // 添加任何未被处理的消息（孤儿消息，可能是数据不一致）
  messages.forEach(msg => {
    if (!processedIds.has(msg.id)) {
      organized.push(msg);
    }
  });
  
  return organized;
};
