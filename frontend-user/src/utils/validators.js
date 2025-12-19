/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * validators - 验证工具函数
 */

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否有效
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 验证手机号格式（中国大陆）
 * @param {string} phone - 手机号
 * @returns {boolean} 是否有效
 */
export const isValidPhone = (phone) => {
  if (!phone) return false;
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * 验证密码强度
 * @param {string} password - 密码
 * @returns {Object} 验证结果 { valid, strength, message }
 */
export const validatePassword = (password) => {
  if (!password) {
    return { valid: false, strength: 0, message: '请输入密码' };
  }
  
  if (password.length < 6) {
    return { valid: false, strength: 1, message: '密码长度至少6位' };
  }
  
  if (password.length < 8) {
    return { valid: true, strength: 2, message: '密码强度：弱' };
  }
  
  let strength = 2;
  
  // 包含数字
  if (/\d/.test(password)) strength++;
  // 包含小写字母
  if (/[a-z]/.test(password)) strength++;
  // 包含大写字母
  if (/[A-Z]/.test(password)) strength++;
  // 包含特殊字符
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
  
  const messages = {
    2: '密码强度：弱',
    3: '密码强度：中',
    4: '密码强度：中',
    5: '密码强度：强',
    6: '密码强度：非常强',
  };
  
  return { 
    valid: true, 
    strength: Math.min(strength, 6), 
    message: messages[Math.min(strength, 6)] 
  };
};

/**
 * 验证 URL 格式
 * @param {string} url - URL
 * @returns {boolean} 是否有效
 */
export const isValidUrl = (url) => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * 验证是否为空
 * @param {*} value - 值
 * @returns {boolean} 是否为空
 */
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * 验证是否为数字
 * @param {*} value - 值
 * @returns {boolean} 是否为数字
 */
export const isNumber = (value) => {
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'string') return !isNaN(parseFloat(value)) && isFinite(value);
  return false;
};

/**
 * 验证文件类型
 * @param {File} file - 文件
 * @param {string[]} acceptedTypes - 允许的类型
 * @returns {boolean} 是否有效
 */
export const isValidFileType = (file, acceptedTypes) => {
  if (!file || !acceptedTypes || acceptedTypes.length === 0) return false;
  
  const fileType = file.type;
  const fileExt = '.' + file.name.split('.').pop().toLowerCase();
  
  return acceptedTypes.some(type => {
    if (type.startsWith('.')) {
      return fileExt === type.toLowerCase();
    }
    if (type.endsWith('/*')) {
      return fileType.startsWith(type.replace('/*', '/'));
    }
    return fileType === type;
  });
};

/**
 * 验证文件大小
 * @param {File} file - 文件
 * @param {number} maxSize - 最大大小（字节）
 * @returns {boolean} 是否有效
 */
export const isValidFileSize = (file, maxSize) => {
  if (!file) return false;
  return file.size <= maxSize;
};

/**
 * 验证年份
 * @param {number|string} year - 年份
 * @returns {boolean} 是否有效
 */
export const isValidYear = (year) => {
  const y = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  return !isNaN(y) && y >= 1900 && y <= currentYear + 1;
};

/**
 * 验证 DOI 格式
 * @param {string} doi - DOI
 * @returns {boolean} 是否有效
 */
export const isValidDOI = (doi) => {
  if (!doi) return false;
  // DOI 格式: 10.前缀/后缀
  const doiRegex = /^10\.\d{4,}\/[^\s]+$/;
  return doiRegex.test(doi);
};

/**
 * 表单字段验证器
 * @param {Object} rules - 验证规则
 * @returns {Function} 验证函数
 */
export const createValidator = (rules) => {
  return (values) => {
    const errors = {};
    
    Object.keys(rules).forEach(field => {
      const fieldRules = rules[field];
      const value = values[field];
      
      for (const rule of fieldRules) {
        if (rule.required && isEmpty(value)) {
          errors[field] = rule.message || `${field}不能为空`;
          break;
        }
        
        if (rule.minLength && value && value.length < rule.minLength) {
          errors[field] = rule.message || `${field}长度不能少于${rule.minLength}`;
          break;
        }
        
        if (rule.maxLength && value && value.length > rule.maxLength) {
          errors[field] = rule.message || `${field}长度不能超过${rule.maxLength}`;
          break;
        }
        
        if (rule.pattern && value && !rule.pattern.test(value)) {
          errors[field] = rule.message || `${field}格式不正确`;
          break;
        }
        
        if (rule.validate && !rule.validate(value, values)) {
          errors[field] = rule.message || `${field}验证失败`;
          break;
        }
      }
    });
    
    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  };
};

