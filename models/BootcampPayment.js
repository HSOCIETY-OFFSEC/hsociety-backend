/**
 * BootcampPayment model
 */
import mongoose from 'mongoose';

const bootcampPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    provider: {
      type: String,
      enum: ['paystack', 'btc'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'GHS',
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'verification_failed'],
      default: 'pending',
    },
    reference: {
      type: String,
      default: '',
      index: true,
    },
    authorizationUrl: {
      type: String,
      default: '',
    },
    txHash: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

bootcampPaymentSchema.index({ provider: 1, reference: 1 });

const BootcampPayment = mongoose.model('BootcampPayment', bootcampPaymentSchema);
export default BootcampPayment;
