/**
 * Student course model (single-track for now)
 */
import mongoose from 'mongoose';

const studentCourseSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const StudentCourse = mongoose.model('StudentCourse', studentCourseSchema);
export default StudentCourse;
