/**
 * Audit model
 */
import mongoose from 'mongoose';

const severitySchema = new mongoose.Schema(
  {
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    info: { type: Number, default: 0 },
  },
  { _id: false }
);

const auditSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: { type: String, default: 'General' },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['draft', 'pending', 'in-review', 'in-progress', 'completed', 'cancelled'],
      default: 'draft',
    },
    severity: { type: severitySchema, default: () => ({}) },
    remediationProgress: { type: Number, default: 0, min: 0, max: 100 },
    tester: { type: String, default: 'Security Team' },
    reportAvailable: { type: Boolean, default: false },
    reportContent: { type: String, default: '' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

auditSchema.index({ status: 1 });
auditSchema.index({ createdAt: -1 });

const Audit = mongoose.model('Audit', auditSchema);
export default Audit;
