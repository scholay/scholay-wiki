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
  
  // 空闲超时配置
  IDLE_TIMEOUT: 5 * 60 * 1000,  // 用户空闲超时 5分钟
  ACTIVITY_EVENTS: ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'],
};

// 消息类型
const MESSAGE_TYPES = {
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  NOTIFICATION: 'notification',
  UNREAD_COUNT: 'unread_count',
  TOAST: 'toast',  // 纯 toast 提示（无站内信记录，不可点击）
};

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.token = null;
    this.isGuest = true;  // 是否为访客连接
    this.isConnecting = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    
    // 用户活动状态
    this.lastActivityTime = Date.now();  // 最后活动时间
    this.isUserActive = true;            // 用户是否活跃
    this.idleTimer = null;               // 空闲检测定时器
    this.activityBound = false;          // 是否已绑定活动事件
    this.idleDisconnected = false;       // 是否因空闲而断开
    this.isReconnecting = false;         // 是否正在重连（防止重复触发）
    
    // 事件监听器
    this.listeners = {
      notification: [],
      unreadCount: [],
      toast: [],  // 纯 toast 提示事件
      connect: [],
      disconnect: [],
      error: [],
      idle: [],   // 空闲断开事件
    };

    // 一次性绑定事件回调，确保 addEventListener / removeEventListener 使用同一个函数引用
    this.handleActivity = this.handleActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * 获取 WebSocket URL
   * @param {string|null} token - JWT token，null 表示访客连接
   */
  getWebSocketURL(token) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // 使用相对路径，通过 Nginx 代理
    if (token) {
      return `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
    }
    // 访客连接，不带 token
    return `${protocol}//${host}/api/v1/ws`;
  }

  /**
   * 连接 WebSocket
   * @param {string|null} token - JWT token，null 或不传表示访客连接
   */
  connect(token = null) {
    if (this.isConnecting || this.isConnected) {
      logger.debug('[WebSocket] Already connected or connecting');
      return;
    }

    this.token = token;
    this.isConnecting = true;
    this.isGuest = !token;

    try {
      const url = this.getWebSocketURL(token);
      const logUrl = token ? url.replace(/token=.*/, 'token=***') : url;
      logger.info(`[WebSocket] Connecting as ${this.isGuest ? 'guest' : 'user'} to`, logUrl);
      
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
   * @param {boolean} preventReconnect - 是否阻止重连（默认 true）
   */
  disconnect(preventReconnect = true) {
    logger.info('[WebSocket] Disconnecting');
    
    this.clearTimers();
    this.reconnectAttempts = 0;
    
    if (preventReconnect) {
      this.token = null;
      this.isGuest = true;
      this.idleDisconnected = false;
      this.isReconnecting = false;
      // 完全断开时停止活动检测
      this.stopActivityDetection();
    }
    
    if (this.ws) {
      if (preventReconnect) {
        this.ws.onclose = null; // 防止触发重连
      }
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
        
        case MESSAGE_TYPES.TOAST:
          // 纯 toast 提示，不创建站内信记录，不可点击
          this.emit('toast', message.data);
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
    
    // 启动用户活动检测
    this.startActivityDetection();
    
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        // 检查用户是否空闲超时
        if (this.checkIdleTimeout()) {
          return; // 空闲超时，已断开连接
        }
        
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
   * 启动用户活动检测
   */
  startActivityDetection() {
    if (this.activityBound) {
      return;
    }

    // 活动事件（回调已在构造函数中一次性绑定）
    WS_CONFIG.ACTIVITY_EVENTS.forEach(eventName => {
      document.addEventListener(eventName, this.handleActivity, { passive: true });
    });

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    this.activityBound = true;
    this.lastActivityTime = Date.now();
    this.isUserActive = true;
    this.idleDisconnected = false;
    this.isReconnecting = false;  // 防止重复重连的标志
    
    logger.debug('[WebSocket] Activity detection started');
  }

  /**
   * 停止用户活动检测
   */
  stopActivityDetection() {
    if (!this.activityBound) {
      return;
    }
    
    WS_CONFIG.ACTIVITY_EVENTS.forEach(eventName => {
      document.removeEventListener(eventName, this.handleActivity);
    });
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    this.activityBound = false;
    logger.debug('[WebSocket] Activity detection stopped');
  }

  /**
   * 处理用户活动事件
   * 只有当页面处于可见状态时，才认为是真正的用户活动
   */
  handleActivity() {
    // 关键检查：只有当页面可见时，才更新活动时间
    // 这可以防止在其他标签页操作时错误地判定为活跃
    if (document.visibilityState !== 'visible') {
      return;
    }
    
    const now = Date.now();
    this.lastActivityTime = now;
    
    // 如果之前因空闲断开，用户活跃后自动重连
    if (this.idleDisconnected && !this.isConnected && !this.isConnecting && !this.isReconnecting) {
      logger.info('[WebSocket] User became active after idle disconnect, reconnecting...');
      this.isReconnecting = true;  // 设置标志防止重复触发
      this.idleDisconnected = false;
      this.reconnectAttempts = 0;
      
      // 延迟一小段时间再重连，避免短时间内多次触发
      setTimeout(() => {
        this.isReconnecting = false;
        if (!this.isConnected && !this.isConnecting) {
          // 使用保存的 token 重连（如果有），否则作为访客连接
          this.connect(this.token);
        }
      }, 100);
    }
    
    if (!this.isUserActive) {
      this.isUserActive = true;
      logger.debug('[WebSocket] User became active');
    }
  }

  /**
   * 处理页面可见性变化
   */
  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // 页面变为可见时，只检查是否需要重连，不自动重置活动时间
      // 需要用户有实际操作才算活跃
      if (this.idleDisconnected && !this.isConnected && !this.isConnecting && !this.isReconnecting) {
        logger.info('[WebSocket] Page became visible after idle disconnect, will reconnect on user activity');
        // 不自动重连，等待用户实际操作
        // 但如果用户切回来并且有操作，handleActivity 会处理重连
      }
    } else {
      // 页面变为不可见（用户切到其他标签页）
      // 此时不应该认为用户是活跃的
      logger.debug('[WebSocket] Page became hidden');
    }
  }

  /**
   * 检查空闲超时
   * @returns {boolean} 是否因空闲而断开
   */
  checkIdleTimeout() {
    const idleTime = Date.now() - this.lastActivityTime;
    
    if (idleTime >= WS_CONFIG.IDLE_TIMEOUT) {
      logger.info(`[WebSocket] User idle for ${Math.round(idleTime / 1000)}s, disconnecting...`);
      this.isUserActive = false;
      this.idleDisconnected = true;
      
      // 触发空闲断开事件
      this.emit('idle', { idleTime });
      
      // 断开连接但保留 token，以便用户活跃时重连
      this.disconnectForIdle();
      return true;
    }
    
    return false;
  }

  /**
   * 因空闲而断开连接（保留重连能力）
   */
  disconnectForIdle() {
    logger.info('[WebSocket] Disconnecting due to idle timeout');
    
    this.clearTimers();
    // 不重置 reconnectAttempts，让活动检测处理重连
    
    if (this.ws) {
      this.ws.onclose = null; // 防止触发正常的重连逻辑
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.isConnected = false;
    
    // 触发断开事件
    this.emit('disconnect', { code: 4000, reason: 'idle_timeout' });
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
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      isUserActive: this.isUserActive,
      idleDisconnected: this.idleDisconnected,
      lastActivityTime: this.lastActivityTime,
      idleTime: Date.now() - this.lastActivityTime,
      pageVisible: document.visibilityState === 'visible',
    };
  }
}

// 单例实例
const wsClient = new WebSocketClient();

export default wsClient;

