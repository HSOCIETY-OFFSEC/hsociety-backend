/**
 * Request validation for auth routes using Joi
 * SECURITY UPDATE IMPLEMENTED: Sanitize and validate all auth inputs
 */
import Joi from 'joi';

const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().max(254).required(),
  password: Joi.string().min(1).max(1024).required(),
  mobile: Joi.string().trim().min(10).max(20).optional(),
  otp: Joi.string().trim().max(10).optional(),
}).unknown(false);

const registerSchema = Joi.object({
  role: Joi.string().valid('student', 'corporate', 'client').required(),
  profile: Joi.object({
    fullName: Joi.string().trim().max(200).allow(''),
    organization: Joi.string().trim().max(200).allow(''),
  }).default({}),
  credentials: Joi.object({
    email: Joi.string().email().trim().lowercase().max(254).required(),
    password: Joi.string().min(8).max(1024).required(),
  }).required(),
  consent: Joi.object().optional(),
  metadata: Joi.object().optional(),
}).unknown(true);

const otpRequestSchema = Joi.object({
  mobile: Joi.string().trim().min(10).max(20).required(),
  context: Joi.string().trim().max(50).optional(),
}).unknown(false);

const otpVerifySchema = Joi.object({
  mobile: Joi.string().trim().min(10).max(20).required(),
  code: Joi.string().trim().length(6).pattern(/^\d+$/).required(),
  context: Joi.string().trim().max(50).optional(),
}).unknown(false);

export function validateLogin(req, res, next) {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Validation failed' });
  }
  req.body = value;
  next();
}

export function validateRegister(req, res, next) {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Validation failed' });
  }
  req.body = value;
  next();
}

export function validateOtpRequest(req, res, next) {
  const { error, value } = otpRequestSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Validation failed' });
  }
  req.body = value;
  next();
}

export function validateOtpVerify(req, res, next) {
  const { error, value } = otpVerifySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Validation failed' });
  }
  req.body = value;
  next();
}
