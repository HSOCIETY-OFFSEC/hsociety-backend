/**
 * Security utilities: password strength, input sanitization for NoSQL
 * SECURITY UPDATE IMPLEMENTED: Strong password rules, NoSQL injection prevention
 */

// SECURITY UPDATE IMPLEMENTED: Enforce strong password (min 8, upper, lower, number, special)
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_UPPER = /[A-Z]/;
const PASSWORD_LOWER = /[a-z]/;
const PASSWORD_NUMBER = /[0-9]/;
const PASSWORD_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!PASSWORD_UPPER.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!PASSWORD_LOWER.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!PASSWORD_NUMBER.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!PASSWORD_SPECIAL.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true, message: '' };
}

// SECURITY UPDATE IMPLEMENTED: Prevent NoSQL injection ($gt, $ne, $where in user input)
const NOSQL_OPERATORS = ['$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin', '$exists', '$regex', '$where', '$eq', '$and', '$or', '$nor', '$not', '$type', '$expr', '$jsonSchema', '$text', '$search', '$meta', '$geoIntersects', '$geoWithin', '$near', '$nearSphere', '$elemMatch', '$all', '$size', '$slice', '$comment'];

export function sanitizeForMongo(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForMongo);

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyRoot = key.replace(/\.\d+$/, '').split('.')[0];
    if (NOSQL_OPERATORS.includes(keyRoot) || key.startsWith('$')) {
      continue;
    }
    out[key] = sanitizeForMongo(value);
  }
  return out;
}

export function sanitizeString(input) {
  if (input == null) return '';
  const s = String(input).trim();
  return s.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 10000);
}
