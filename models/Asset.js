import mongoose from 'mongoose';

/**
 * Corporate asset inventory used for pentest scoping and tracking.
 */
const assetSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['Domain', 'IP Range', 'Application', 'Cloud Environment', 'Other'],
      default: 'Domain',
    },
    name: { type: String, required: true, trim: true },
    details: { type: String, default: '', trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetSchema.index({ ownerId: 1, createdAt: -1 });

const Asset = mongoose.model('Asset', assetSchema);
export default Asset;
