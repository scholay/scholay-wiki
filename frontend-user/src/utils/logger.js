/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

// Production-safe logging utility
// This utility will only log in development mode

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.REACT_APP_ENABLE_LOGS === 'true';

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
  error: (...args) => {
    // Always log errors, even in production
    console.error(...args);
  },
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  }
};

export default logger;
