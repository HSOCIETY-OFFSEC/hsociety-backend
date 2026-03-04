/**
 * Auth Service
 * Register, login, token issuance. Uses User model and bcrypt/JWT.
 * SECURITY UPDATE IMPLEMENTED: Strong passwords, bcrypt 12, refresh token storage, short-lived access
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import { validatePasswordStrength } from '../utils/security.js';

// SECURITY UPDATE IMPLEMENTED: Salt rounds >= 12 for secure hashing
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
// SECURITY UPDATE IMPLEMENTED: Short-lived access token (15-30 min)
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '20m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const JWT_2FA_EXPIRY = process.env.JWT_2FA_EXPIRY || '5m';

const normalizeEmail = (input) => (typeof input === 'string' ? input.trim().toLowerCase() : '');

/**
 * Map frontend role to backend User.role
 * corporate -> pentester; student -> student
 */
function mapRole(frontendRole) {
  if (frontendRole === 'student') return 'student';
  if (frontendRole === 'corporate' || frontendRole === 'client') return 'corporate';
  if (frontendRole === 'pentester') return 'pentester';
  return 'student';
}

/**
 * Hash password for storage
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare plain password with stored hash
 */
async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash refresh token for storage (SECURITY UPDATE IMPLEMENTED: store hashed only)
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issue access and refresh tokens for a user.
 * SECURITY UPDATE IMPLEMENTED: Short access, refresh stored hashed in DB, rotation on use.
 * @returns { accessToken, refreshToken, expiresIn } expiresIn in seconds
 */
export async function issueTokens(userId, email, role, meta = {}) {
  const payload = { sub: userId, email, role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh', jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );
  const decoded = jwt.decode(accessToken);
  const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 1200;
  const refreshDecoded = jwt.decode(refreshToken);
  const expiresAt = refreshDecoded?.exp ? new Date(refreshDecoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt,
    userAgent: meta.userAgent || '',
    ipAddress: meta.ipAddress || '',
  });
  return { accessToken, refreshToken, expiresIn };
}

/**
 * Issue short-lived 2FA token after primary login
 */
export function issueTwoFactorToken(userId, email, role) {
  const payload = { sub: userId, email, role, type: '2fa' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_2FA_EXPIRY });
}

/**
 * Build safe user object for response (no passwordHash)
 * SECURITY UPDATE IMPLEMENTED: Expose mustChangePassword so frontend can force update
 */
export function toUserResponse(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name || '',
    role: doc.role,
    organization: doc.organization || '',
    avatarUrl: doc.avatarUrl || '',
    bootcampStatus: doc.bootcampStatus || 'not_enrolled',
    bootcampPaymentStatus: doc.bootcampPaymentStatus || 'unpaid',
    twoFactorEnabled: !!doc.twoFactorEnabled,
    hackerHandle: doc.hackerHandle || '',
    bio: doc.bio || '',
    mustChangePassword: !!doc.mustChangePassword,
  };
}

/**
 * Register: create user.
 * Frontend sends: { role, profile: { fullName, organization }, credentials: { email, password } }
 */
export async function register(payload, meta = {}) {
  const { role: frontendRole, profile, credentials } = payload || {};
  if (!credentials?.email || !credentials?.password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }
  const email = String(credentials.email).trim().toLowerCase();
  const password = String(credentials.password);
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.message);
    err.status = 400;
    throw err;
  }
  const name = profile?.fullName ? String(profile.fullName).trim() : '';
  const organization = profile?.organization ? String(profile.organization).trim() : '';
  const role = mapRole(frontendRole);

  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    name,
    organization,
    role,
  });

  const { accessToken, refreshToken, expiresIn } = await issueTokens(user._id, user.email, user.role, meta);
  return {
    user: toUserResponse(user),
    token: accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Login: find user by email, compare password.
 * Body: { email, password }
 */
export async function login(email, password, meta = {}) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }
  const rawIdentity = String(email || '').trim();
  const normalizedEmail = normalizeEmail(rawIdentity);
  const identityRegex = new RegExp(`^${rawIdentity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  const user = await User.findOne({
    $or: [
      { email: normalizedEmail },
      { name: identityRegex },
      { hackerHandle: identityRegex },
    ]
  }).select('+passwordHash +mustChangePassword');
  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const match = await comparePassword(password, user.passwordHash);
  if (!match) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  // SECURITY UPDATE IMPLEMENTED: Existing users with weak passwords must change before full access
  const pwdCheck = validatePasswordStrength(password);
  if (!pwdCheck.valid && !user.mustChangePassword) {
    await User.updateOne({ _id: user._id }, { $set: { mustChangePassword: true } });
    user.mustChangePassword = true;
  }
  if (user.mustChangePassword) {
    const passwordChangeToken = jwt.sign(
      { sub: user._id, email: user.email, type: 'password_change' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    return {
      mustChangePassword: true,
      passwordChangeToken,
      user: toUserResponse({ ...user.toObject(), mustChangePassword: true }),
    };
  }

  if (user.twoFactorEnabled) {
    const twoFactorToken = issueTwoFactorToken(user._id, user.email, user.role);
    return {
      twoFactorRequired: true,
      twoFactorToken,
      user: toUserResponse(user),
    };
  }

  const { accessToken, refreshToken, expiresIn } = await issueTokens(user._id, user.email, user.role, meta);
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  return {
    user: toUserResponse(user),
    token: accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Refresh: verify refresh token (must exist in DB, not revoked), rotate refresh token.
 * SECURITY UPDATE IMPLEMENTED: Hashed token in DB, rotate on use, invalidate old.
 * Body: { refreshToken } or cookie
 */
export async function refresh(refreshTokenValue, meta = {}) {
  if (!refreshTokenValue) {
    const err = new Error('Refresh token is required');
    err.status = 400;
    throw err;
  }
  let decoded;
  try {
    decoded = jwt.verify(refreshTokenValue, JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }
  if (decoded.type !== 'refresh') {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }
  const tokenHash = hashRefreshToken(refreshTokenValue);
  const stored = await RefreshToken.findOne({ tokenHash, revoked: false }).lean();
  if (!stored || new Date(stored.expiresAt) < new Date()) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }
  await RefreshToken.updateOne({ _id: stored._id }, { $set: { revoked: true } });
  const user = await User.findById(decoded.sub).lean();
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }
  const { accessToken, refreshToken: newRefreshToken, expiresIn } = await issueTokens(
    user._id,
    user.email,
    user.role,
    meta
  );
  return {
    user: toUserResponse(user),
    token: accessToken,
    refreshToken: newRefreshToken,
    expiresIn,
  };
}

/**
 * Invalidate all refresh tokens for a user (logout). SECURITY UPDATE IMPLEMENTED
 */
export async function invalidateRefreshTokensForUser(userId) {
  await RefreshToken.updateMany({ userId }, { $set: { revoked: true } });
}

/**
 * Change password: verify current, validate new strength, hash and save. Clear mustChangePassword.
 * SECURITY UPDATE IMPLEMENTED
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (currentPassword != null && currentPassword !== '') {
    const match = await comparePassword(currentPassword, user.passwordHash);
    if (!match) {
      const err = new Error('Current password is incorrect');
      err.status = 401;
      throw err;
    }
  }
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.message);
    err.status = 400;
    throw err;
  }
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save({ validateBeforeSave: false });
  return { success: true };
}

export function issuePasswordChangeToken(userId, email) {
  return jwt.sign(
    { sub: userId, email, type: 'password_change' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export default {
  register,
  login,
  refresh,
  issueTokens,
  issueTwoFactorToken,
  issuePasswordChangeToken,
  toUserResponse,
  invalidateRefreshTokensForUser,
  changePassword,
};
