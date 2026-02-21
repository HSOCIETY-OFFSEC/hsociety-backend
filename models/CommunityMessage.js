/**
 * Community Message model
 */
import mongoose from 'mongoose';

const communityMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    room: { type: String, required: true },
    content: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

communityMessageSchema.index({ room: 1, createdAt: -1 });

const CommunityMessage = mongoose.model('CommunityMessage', communityMessageSchema);
export default CommunityMessage;
