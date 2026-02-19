/**
 * Community Post model
 */
import mongoose from 'mongoose';

const communityPostSchema = new mongoose.Schema(
  {
    authorName: { type: String, default: 'Community Member' },
    authorRole: { type: String, default: 'Security Learner' },
    authorAvatar: { type: String, default: '' },
    title: { type: String, default: 'Untitled post' },
    body: { type: String, default: '' },
    tags: { type: [String], default: [] },
    likes: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    visibility: { type: String, default: 'public' },
    roleContext: { type: String, default: 'student' },
    attachments: { type: [String], default: [] },
    metadata: mongoose.Schema.Types.Mixed,
    likedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    savedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
);

communityPostSchema.index({ createdAt: -1 });
communityPostSchema.index({ likes: -1 });

const CommunityPost = mongoose.model('CommunityPost', communityPostSchema);
export default CommunityPost;
