export const isValidEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPhone = (phone: string | null | undefined): boolean => {
  if (!phone) return false;
  return /^1[3-9]\d{9}$/.test(phone);
};

interface PasswordValidation {
  valid: boolean;
  strength: number;
  message: string;
}

export const validatePassword = (password: string | null | undefined): PasswordValidation => {
  if (!password) return { valid: false, strength: 0, message: '请输入密码' };
  if (password.length < 6) return { valid: false, strength: 1, message: '密码长度至少6位' };
  if (password.length < 8) return { valid: true, strength: 2, message: '密码强度：弱' };

  let strength = 2;
  if (/\d/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

  const messages: Record<number, string> = {
    2: '密码强度：弱',
    3: '密码强度：中',
    4: '密码强度：中',
    5: '密码强度：强',
    6: '密码强度：非常强',
  };

  const s = Math.min(strength, 6);
  return { valid: true, strength: s, message: messages[s] };
};

export const isValidUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isEmpty = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

export const isNumber = (value: any): boolean => {
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'string') return !isNaN(parseFloat(value)) && isFinite(Number(value));
  return false;
};

export const isValidFileType = (file: File | null | undefined, acceptedTypes: string[]): boolean => {
  if (!file || !acceptedTypes || acceptedTypes.length === 0) return false;
  const fileType = file.type;
  const fileExt = '.' + file.name.split('.').pop()!.toLowerCase();
  return acceptedTypes.some((type) => {
    if (type.startsWith('.')) return fileExt === type.toLowerCase();
    if (type.endsWith('/*')) return fileType.startsWith(type.replace('/*', '/'));
    return fileType === type;
  });
};

export const isValidFileSize = (file: File | null | undefined, maxSize: number): boolean => {
  if (!file) return false;
  return file.size <= maxSize;
};

export const isValidYear = (year: number | string): boolean => {
  const y = typeof year === 'string' ? parseInt(year, 10) : year;
  const currentYear = new Date().getFullYear();
  return !isNaN(y) && y >= 1900 && y <= currentYear + 1;
};

export const isValidDOI = (doi: string | null | undefined): boolean => {
  if (!doi) return false;
  return /^10\.\d{4,}\/[^\s]+$/.test(doi);
};

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  validate?: (value: any, values: Record<string, any>) => boolean;
  message?: string;
}

export const createValidator = (rules: Record<string, ValidationRule[]>) => {
  return (values: Record<string, any>) => {
    const errors: Record<string, string> = {};
    Object.keys(rules).forEach((field) => {
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
    return { valid: Object.keys(errors).length === 0, errors };
  };
};
