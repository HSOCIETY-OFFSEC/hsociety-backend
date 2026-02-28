import mongoose from 'mongoose';

const securityEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, default: 'activity' },
    action: { type: String, required: true, default: 'user_action' },
    path: { type: String, default: '' },
    method: { type: String, default: '' },
    statusCode: { type: Number, default: 0 },
    ipAddress: { type: String, default: '' },
    // Browsers do not expose real MAC addresses on the public web.
    macAddress: { type: String, default: 'unavailable' },
    userAgent: { type: String, default: '' },
    deviceId: { type: String, default: '' },
    metadata: mongoose.Schema.Types.Mixed,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ eventType: 1, createdAt: -1 });
securityEventSchema.index({ userId: 1, createdAt: -1 });
securityEventSchema.index({ ipAddress: 1, createdAt: -1 });

const SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);
export default SecurityEvent;
