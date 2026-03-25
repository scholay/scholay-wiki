import {
  isValidEmail,
  isValidPhone,
  getPasswordError,
  validatePassword,
  isValidUrl,
  isEmpty,
  isNumber,
  isValidYear,
  isValidDOI,
  createValidator,
} from './validators';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('a@b.c')).toBe(true);
    expect(isValidEmail('user.name+tag@domain.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts valid Chinese phone numbers', () => {
    expect(isValidPhone('13800138000')).toBe(true);
    expect(isValidPhone('19912345678')).toBe(true);
  });

  it('rejects invalid phone numbers', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone('12345678901')).toBe(false);
    expect(isValidPhone('1380013800')).toBe(false);
    expect(isValidPhone('23800138000')).toBe(false);
  });
});

describe('getPasswordError', () => {
  it('returns error for short passwords', () => {
    expect(getPasswordError('abc1')).toBe('密码长度至少8位');
  });

  it('returns error for too-long passwords', () => {
    expect(getPasswordError('a'.repeat(33) + '1')).toBe('密码长度不能超过32位');
  });

  it('requires letters', () => {
    expect(getPasswordError('12345678')).toBe('密码必须包含字母');
  });

  it('requires numbers', () => {
    expect(getPasswordError('abcdefgh')).toBe('密码必须包含数字');
  });

  it('returns empty string for valid passwords', () => {
    expect(getPasswordError('abc12345')).toBe('');
  });
});

describe('validatePassword', () => {
  it('returns invalid for empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
  });

  it('returns invalid for very short password', () => {
    const result = validatePassword('abc');
    expect(result.valid).toBe(false);
    expect(result.strength).toBe(1);
  });

  it('returns higher strength for complex passwords', () => {
    const weak = validatePassword('abcdefgh');
    const strong = validatePassword('Abc123!@#def');
    expect(strong.strength).toBeGreaterThan(weak.strength);
  });
});

describe('isValidUrl', () => {
  it('accepts valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('isEmpty', () => {
  it('detects empty values', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('  ')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it('detects non-empty values', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });
});

describe('isNumber', () => {
  it('accepts valid numbers', () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber(3.14)).toBe(true);
    expect(isNumber('42')).toBe(true);
    expect(isNumber('3.14')).toBe(true);
  });

  it('rejects non-numbers', () => {
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber('abc')).toBe(false);
    expect(isNumber('')).toBe(false);
    expect(isNumber(null)).toBe(false);
  });
});

describe('isValidYear', () => {
  it('accepts valid years', () => {
    expect(isValidYear(2024)).toBe(true);
    expect(isValidYear('1900')).toBe(true);
  });

  it('rejects invalid years', () => {
    expect(isValidYear(1899)).toBe(false);
    expect(isValidYear(3000)).toBe(false);
    expect(isValidYear('abc')).toBe(false);
  });
});

describe('isValidDOI', () => {
  it('accepts valid DOIs', () => {
    expect(isValidDOI('10.1000/test')).toBe(true);
    expect(isValidDOI('10.12345/xyz.123')).toBe(true);
  });

  it('rejects invalid DOIs', () => {
    expect(isValidDOI('')).toBe(false);
    expect(isValidDOI(null)).toBe(false);
    expect(isValidDOI('11.1000/test')).toBe(false);
    expect(isValidDOI('not-a-doi')).toBe(false);
  });
});

describe('createValidator', () => {
  it('validates required fields', () => {
    const validate = createValidator({
      email: [{ required: true, message: '邮箱不能为空' }],
    });
    const result = validate({ email: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe('邮箱不能为空');
  });

  it('validates minLength', () => {
    const validate = createValidator({
      name: [{ minLength: 2, message: '至少2个字符' }],
    });
    const result = validate({ name: 'a' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('至少2个字符');
  });

  it('passes when all rules are satisfied', () => {
    const validate = createValidator({
      email: [{ required: true }],
      name: [{ minLength: 2 }],
    });
    const result = validate({ email: 'test@test.com', name: 'Tom' });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });
});
