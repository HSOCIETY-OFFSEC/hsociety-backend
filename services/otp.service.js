/**
 * Mobile OTP service - 6-digit codes, 5 min expiry
 * Sends OTP via Twilio SMS when configured; otherwise logs to console (dev).
 * SECURITY: OTP never returned in API response.
 */
import crypto from 'crypto';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_LENGTH = 6;
const store = new Map(); // key: context::normalized -> { code, expiresAt }

function normalizeMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '';
  return mobile.replace(/\D/g, '').slice(-15);
}

/** Build E.164 number for Twilio (e.g. +15551234567). */
function toE164(normalizedDigits) {
  const country = process.env.TWILIO_DEFAULT_COUNTRY_CODE || '1';
  const prefix = normalizedDigits.startsWith(country) ? '' : country;
  return `+${prefix}${normalizedDigits}`;
}

function generateOTP() {
  const digits = crypto.randomInt(0, Math.pow(10, OTP_LENGTH));
  return String(digits).padStart(OTP_LENGTH, '0');
}

/** Send OTP via Twilio SMS. Returns true if sent, false otherwise. */
async function sendOTPViaTwilio(toNormalized, code, context) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return false;
  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);
    const to = toE164(toNormalized);
    const body = `Your HSOCIETY ${context} code is: ${code}. It expires in 5 minutes.`;
    await client.messages.create({ body, from: fromNumber, to });
    return true;
  } catch (err) {
    console.error('[OTP] Twilio send error:', err.message);
    return false;
  }
}

/**
 * Create OTP for a mobile number and send it (Twilio if configured, else log).
 * SECURITY: Do not return OTP in API response.
 */
export async function createAndSendOTP(mobile, context = 'login') {
  const normalized = normalizeMobile(mobile);
  if (normalized.length < 10) {
    return { success: false, message: 'Invalid mobile number' };
  }
  const code = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  const key = `${context}::${normalized}`;
  store.set(key, { code, expiresAt });

  const sent = await sendOTPViaTwilio(normalized, code, context);
  if (!sent) {
    console.log(`[OTP] ${context} for ${normalized}: ${code} (expires in 5 min) - set TWILIO_* to send real SMS`);
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
 * Resend OTP - invalidates previous, creates new. Rate limit at route level.
 */
export async function resendOTP(mobile, context = 'login') {
  return createAndSendOTP(mobile, context);
}

export default { createAndSendOTP, verifyOTP, resendOTP };
