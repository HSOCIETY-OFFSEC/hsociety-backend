/**
 * Quiz submission model
 */
import mongoose from 'mongoose';

const quizSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    scope: {
      type: { type: String, required: true },
      id: { type: String, required: true },
      courseId: { type: String, default: '' },
    },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

quizSubmissionSchema.index({ userId: 1, createdAt: -1 });

const QuizSubmission = mongoose.model('QuizSubmission', quizSubmissionSchema);
export default QuizSubmission;
