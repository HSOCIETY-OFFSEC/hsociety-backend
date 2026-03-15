import { Audit, CaseStudy, Feedback, Notification, Pentest, User } from '../models/index.js';
import { emitNotifications } from '../sockets/socket.store.js';

export async function assignEngagement(pentestId, assignedTo) {
  const previous = await Pentest.findById(pentestId).select('assignedTo title requestedBy').lean();
  const updates = {
    assignedTo: assignedTo || null,
    status: assignedTo ? 'in-progress' : 'pending',
  };
  if (assignedTo) updates.startedAt = new Date();

  const doc = await Pentest.findByIdAndUpdate(
    pentestId,
    { $set: updates },
    { new: true }
  ).lean();
  if (doc && assignedTo && (!previous?.assignedTo || String(previous.assignedTo) !== String(assignedTo))) {
    const notice = await Notification.create({
      userId: assignedTo,
      type: 'engagement_assignment',
      title: 'New engagement assigned',
      message: `You have been assigned to ${doc.title || 'a new engagement'}.`,
      metadata: { pentestId: doc._id.toString() },
    });
    emitNotifications([notice]);
  }
  return doc;
}

export async function approvePaidPentest(pentestId) {
  const doc = await Pentest.findByIdAndUpdate(
    pentestId,
    {
      $set: {
        'metadata.paymentStatus': 'approved',
        status: 'in-progress',
      },
    },
    { new: true }
  ).lean();
  return doc;
}

export async function publishCaseStudy(adminUserId, payload = {}) {
  const status = payload.status === 'draft' ? 'draft' : 'published';
  const doc = await CaseStudy.create({
    title: String(payload.title || 'Untitled Case Study').trim(),
    summary: String(payload.summary || '').trim(),
    body: String(payload.body || '').trim(),
    pentestId: payload.pentestId || null,
    status,
    publishedAt: status === 'published' ? new Date() : null,
    createdBy: adminUserId,
  });

  return {
    id: doc._id.toString(),
    title: doc.title,
    summary: doc.summary,
    status: doc.status,
    publishedAt: doc.publishedAt,
  };
}

export async function getAnalytics() {
  const [
    totalUsers,
    students,
    pentesters,
    corporates,
    activePentests,
    completedPentests,
    pendingApprovals,
    publishedCaseStudies,
    openFeedback,
    completedAudits,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'pentester' }),
    User.countDocuments({ role: 'corporate' }),
    Pentest.countDocuments({ status: { $in: ['pending', 'in-progress'] } }),
    Pentest.countDocuments({ status: 'completed' }),
    Pentest.countDocuments({ 'metadata.paymentStatus': 'pending_approval' }),
    CaseStudy.countDocuments({ status: 'published' }),
    Feedback.countDocuments({ status: { $ne: 'resolved' } }),
    Audit.countDocuments({ status: 'completed' }),
  ]);

  return {
    users: { totalUsers, students, pentesters, corporates },
    engagements: { activePentests, completedPentests, pendingApprovals },
    content: { publishedCaseStudies },
    quality: { openFeedback, completedAudits },
  };
}
