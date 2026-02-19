/**
 * Community configuration (singleton)
 */
import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const mentorSchema = new mongoose.Schema(
  {
    id: { type: String, default: 'mentor' },
    name: { type: String, default: 'Mentor' },
    role: { type: String, default: 'Security Lead' },
    avatar: { type: String, default: '' },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    id: { type: String, default: 'weekly' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const communityConfigSchema = new mongoose.Schema(
  {
    stats: {
      learners: { type: Number, default: 12000 },
      questions: { type: Number, default: 4000 },
      answered: { type: Number, default: 1300 },
    },
    channels: { type: [channelSchema], default: [] },
    tags: { type: [String], default: [] },
    mentor: { type: mentorSchema, default: () => ({}) },
    challengeStudent: { type: challengeSchema, default: () => ({}) },
    challengeCorporate: { type: challengeSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const CommunityConfig = mongoose.model('CommunityConfig', communityConfigSchema);
export default CommunityConfig;
