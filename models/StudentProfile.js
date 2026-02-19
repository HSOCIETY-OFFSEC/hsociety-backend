/**
 * Student profile/progress snapshot
 */
import mongoose from 'mongoose';

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const StudentProfile = mongoose.model('StudentProfile', studentProfileSchema);
export default StudentProfile;
