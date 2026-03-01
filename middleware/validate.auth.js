/**
 * Request validation for auth routes using Joi
 * SECURITY UPDATE IMPLEMENTED: Sanitize and validate all auth inputs
 */
import Joi from 'joi';

const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().max(254).required(),
  password: Joi.string().min(1).max(1024).required(),
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

