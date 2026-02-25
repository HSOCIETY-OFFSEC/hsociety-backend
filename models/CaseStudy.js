import mongoose from 'mongoose';

/**
 * Admin-published case study artifacts.
 */
const caseStudySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '', trim: true },
    body: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    pentestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pentest' },
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

caseStudySchema.index({ status: 1, publishedAt: -1 });

const CaseStudy = mongoose.model('CaseStudy', caseStudySchema);
export default CaseStudy;
