/**
 * Dashboard activity model
 */
import mongoose from 'mongoose';

const dashboardActivitySchema = new mongoose.Schema(
  {
    type: { type: String, default: 'activity' },
    title: { type: String, default: 'Activity' },
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now },
    icon: { type: String, default: 'shield' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

dashboardActivitySchema.index({ createdAt: -1 });
dashboardActivitySchema.index({ userId: 1, createdAt: -1 });

const DashboardActivity = mongoose.model('DashboardActivity', dashboardActivitySchema);
export default DashboardActivity;
