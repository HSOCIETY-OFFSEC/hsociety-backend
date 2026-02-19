/**
 * Quiz model (by scope)
 */
import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], default: [] },
    correctIndex: { type: Number, default: 0 },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    scope: {
      type: { type: String, required: true },
      id: { type: String, required: true },
      courseId: { type: String, default: '' },
    },
    questions: { type: [quizQuestionSchema], default: [] },
  },
  { timestamps: true }
);

quizSchema.index({ 'scope.type': 1, 'scope.id': 1, 'scope.courseId': 1 }, { unique: true });

const Quiz = mongoose.model('Quiz', quizSchema);
export default Quiz;
