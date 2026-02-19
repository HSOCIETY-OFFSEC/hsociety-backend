/**
 * Student overview model (dashboard data)
 */
import mongoose from 'mongoose';

const studentOverviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    learningPath: { type: [mongoose.Schema.Types.Mixed], default: [] },
    challenges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mentors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    snapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

studentOverviewSchema.index({ userId: 1 });

const StudentOverview = mongoose.model('StudentOverview', studentOverviewSchema);
export default StudentOverview;
