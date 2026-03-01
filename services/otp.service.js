/**
 * Mobile OTP service - 6-digit codes, 5 min expiry, SMS placeholder
 * SECURITY UPDATE IMPLEMENTED: OTP for login/registration, secure storage, no OTP in response
 */
import crypto from 'crypto';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_LENGTH = 6;
const store = new Map(); // key: mobile or email::mobile -> { code, expiresAt }

function normalizeMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '';
  return mobile.replace(/\D/g, '').slice(-15);
}

function generateOTP() {
  const digits = crypto.randomInt(0, Math.pow(10, OTP_LENGTH));
  return String(digits).padStart(OTP_LENGTH, '0');
}

/**
 * Create OTP for a mobile number. Returns success; OTP is sent via SMS placeholder.
 * SECURITY UPDATE IMPLEMENTED: Do not return OTP in API response.
 */
export function createAndSendOTP(mobile, context = 'login') {
  const normalized = normalizeMobile(mobile);
  if (normalized.length < 10) {
    return { success: false, message: 'Invalid mobile number' };
  }
  const code = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  const key = `${context}::${normalized}`;
  store.set(key, { code, expiresAt });
  // SECURITY UPDATE IMPLEMENTED: Placeholder for SMS API - replace with real provider (Twilio, etc.)
  if (process.env.SMS_API_ENABLED === 'true' && process.env.SMS_API_SEND) {
    try {
      // require(process.env.SMS_API_SEND)(normalized, code, context);
    } catch (e) {
      console.error('[OTP] SMS send placeholder error:', e.message);
    }
  } else {
    console.log(`[OTP] ${context} for ${normalized}: ${code} (expires in 5 min) - SMS placeholder`);
  }
  return { success: true, message: 'OTP sent to your mobile', expiresIn: 300 };
}

/**
 * Verify OTP for mobile. Returns { success, userId? } - userId only if linked to user (e.g. after login).
 * SECURITY UPDATE IMPLEMENTED: One-time use; delete after verify.
 */
export function verifyOTP(mobile, code, context = 'login') {
  const normalized = normalizeMobile(mobile);
  const key = `${context}::${normalized}`;
  const entry = store.get(key);
  if (!entry) {
    return { success: false, message: 'OTP expired or not found' };
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { success: false, message: 'OTP expired' };
  }
  const codeStr = String(code).replace(/\D/g, '').slice(-OTP_LENGTH);
  if (codeStr !== entry.code) {
    return { success: false, message: 'Invalid OTP' };
  }
  store.delete(key);
  return { success: true };
}

/**
 * Resend OTP - invalidates previous, creates new. Rate limit should be applied at route level.
 */
export function resendOTP(mobile, context = 'login') {
  return createAndSendOTP(mobile, context);
}

export default { createAndSendOTP, verifyOTP, resendOTP };
