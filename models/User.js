/**
 * User model - auth and profile
 */
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['student', 'pentester', 'corporate', 'admin'],
      default: 'student',
    },
    organization: {
      type: String,
      trim: true,
      default: '',
    },
    hackerHandle: {
      type: String,
      trim: true,
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    mutedUntil: {
      type: Date,
      default: null,
    },
    bootcampStatus: {
      type: String,
      enum: ['not_enrolled', 'enrolled', 'active', 'completed'],
      default: 'not_enrolled',
    },
    bootcampAccess: {
      type: Boolean,
      default: false,
    },
    bootcampPaymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid'],
      default: 'unpaid',
    },
    bootcampPaymentRef: {
      type: String,
      default: '',
    },
    bootcampPaidAt: Date,
    emailVerified: {
      type: Boolean,
      default: false,
    },
    otpSecret: { type: String, select: false },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: { type: String, select: false },
    twoFactorTempSecret: { type: String, select: false },
    twoFactorBackupCodes: { type: [String], select: false, default: [] },
    lastLoginAt: Date,
    // SECURITY UPDATE IMPLEMENTED: Force password update for weak passwords
    mustChangePassword: { type: Boolean, default: false },
    // SECURITY UPDATE IMPLEMENTED: Mobile for OTP verification
    mobile: { type: String, trim: true, default: '' },
    passwordResetTokenHash: { type: String, select: false, default: '' },
    passwordResetExpiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);
export default User;
