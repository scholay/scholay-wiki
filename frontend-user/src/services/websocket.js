/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * WebSocket 客户端服务
 * 
 * 功能：
 * 1. 单例模式管理 WebSocket 连接
 * 2. 自动重连机制（指数退避）
 * 3. 心跳保活
 * 4. 消息类型分发
 */

import logger from '../utils/logger';

// WebSocket 配置
const WS_CONFIG = {
  // 重连配置
  RECONNECT_BASE_DELAY: 1000,    // 基础重连延迟 1秒
  RECONNECT_MAX_DELAY: 30000,   // 最大重连延迟 30秒
  RECONNECT_MAX_ATTEMPTS: 10,   // 最大重连次数
  
  // 心跳配置
  PING_INTERVAL: 30000,         // 心跳间隔 30秒
  PONG_TIMEOUT: 10000,          // 等待 pong 超时 10秒
};

// 消息类型
const MESSAGE_TYPES = {
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  NOTIFICATION: 'notification',
  UNREAD_COUNT: 'unread_count',
};

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.token = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    
    // 事件监听器
    this.listeners = {
      notification: [],
      unreadCount: [],
      connect: [],
      disconnect: [],
      error: [],
    };
  }

  /**
   * 获取 WebSocket URL
   */
  getWebSocketURL(token) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // 使用相对路径，通过 Nginx 代理
    return `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
  }

  /**
   * 连接 WebSocket
   */
  connect(token) {
    if (this.isConnecting || this.isConnected) {
      logger.debug('[WebSocket] Already connected or connecting');
      return;
    }

    if (!token) {
      logger.warn('[WebSocket] No token provided');
      return;
    }

    this.token = token;
    this.isConnecting = true;

    try {
      const url = this.getWebSocketURL(token);
      logger.info('[WebSocket] Connecting to', url.replace(/token=.*/, 'token=***'));
      
      this.ws = new WebSocket(url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      logger.error('[WebSocket] Failed to create connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    logger.info('[WebSocket] Disconnecting');
    
    this.clearTimers();
    this.reconnectAttempts = 0;
    this.token = null;
    
    if (this.ws) {
      this.ws.onclose = null; // 防止触发重连
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.isConnected = false;
  }

  /**
   * 处理连接打开
   */
  handleOpen() {
    logger.info('[WebSocket] Connected');
    this.isConnecting = false;
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // 启动心跳
    this.startPing();
    
    // 触发连接事件
    this.emit('connect');
  }

  /**
   * 处理连接关闭
   */
  handleClose(event) {
    logger.info('[WebSocket] Disconnected', { code: event.code, reason: event.reason });
    
    this.isConnecting = false;
    this.isConnected = false;
    this.clearTimers();
    
    // 触发断开事件
    this.emit('disconnect', { code: event.code, reason: event.reason });
    
    // 如果有 token，尝试重连
    if (this.token) {
      this.scheduleReconnect();
    }
  }

  /**
   * 处理错误
   */
  handleError(error) {
    logger.error('[WebSocket] Error:', error);
    this.emit('error', error);
  }

  /**
   * 处理消息
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      logger.debug('[WebSocket] Received:', message.type);
      
      switch (message.type) {
        case MESSAGE_TYPES.PONG:
          this.handlePong();
          break;
          
        case MESSAGE_TYPES.NOTIFICATION:
          this.emit('notification', message.data);
          break;
          
        case MESSAGE_TYPES.UNREAD_COUNT:
          this.emit('unreadCount', message.data);
          break;
          
        case MESSAGE_TYPES.ERROR:
          logger.error('[WebSocket] Server error:', message.data);
          this.emit('error', message.data);
          break;
          
        default:
          logger.debug('[WebSocket] Unknown message type:', message.type);
      }
    } catch (error) {
      logger.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * 发送消息
   */
  send(type, data = null) {
    if (!this.isConnected || !this.ws) {
      logger.warn('[WebSocket] Cannot send, not connected');
      return false;
    }
    
    try {
      const message = { type };
      if (data !== null) {
        message.data = data;
      }
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('[WebSocket] Failed to send message:', error);
      return false;
    }
  }

  /**
   * 启动心跳
   */
  startPing() {
    this.clearTimers();
    
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.send(MESSAGE_TYPES.PING);
        
        // 设置 pong 超时
        this.pongTimer = setTimeout(() => {
          logger.warn('[WebSocket] Pong timeout, reconnecting');
          this.ws?.close();
        }, WS_CONFIG.PONG_TIMEOUT);
      }
    }, WS_CONFIG.PING_INTERVAL);
  }

  /**
   * 处理 pong 响应
   */
  handlePong() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * 清除定时器
   */
  clearTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 计划重连
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= WS_CONFIG.RECONNECT_MAX_ATTEMPTS) {
      logger.error('[WebSocket] Max reconnect attempts reached');
      return;
    }
    
    // 指数退避
    const delay = Math.min(
      WS_CONFIG.RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      WS_CONFIG.RECONNECT_MAX_DELAY
    );
    
    this.reconnectAttempts++;
    logger.info(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      if (this.token) {
        this.connect(this.token);
      }
    }, delay);
  }

  /**
   * 添加事件监听器
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => this.off(event, callback);
  }

  /**
   * 移除事件监听器
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`[WebSocket] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// 单例实例
const wsClient = new WebSocketClient();

export default wsClient;

