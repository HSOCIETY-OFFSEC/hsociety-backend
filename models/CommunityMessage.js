/**
 * Community Message model
 */
import mongoose from 'mongoose';

const communityMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    hackerHandle: { type: String, default: '' },
    userRole: { type: String, default: '' },
    userAvatar: { type: String, default: '' },
    room: { type: String, required: true },
    content: { type: String, default: '', maxlength: 500 },
    imageUrl: { type: String, default: '' },
    likes: { type: Number, default: 0 },
    likedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    reactions: {
      type: Map,
      of: new mongoose.Schema(
        {
          count: { type: Number, default: 0 },
          users: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }
        },
        { _id: false }
      ),
      default: {}
    },
    pinned: { type: Boolean, default: false },
    comments: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          username: { type: String, default: 'Community Member' },
          content: { type: String, maxlength: 300 },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

communityMessageSchema.index({ room: 1, createdAt: -1 });

const CommunityMessage = mongoose.model('CommunityMessage', communityMessageSchema);
export default CommunityMessage;
