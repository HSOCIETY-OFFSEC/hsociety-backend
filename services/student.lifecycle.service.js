import { Pentest, StudentProfile, User } from '../models/index.js';

const ensureSnapshot = async (userId) => {
  const profile = await StudentProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { snapshot: {} } },
    { upsert: true, new: true }
  ).lean();

  return profile?.snapshot || {};
};

export async function enrollTraining(userId, payload = {}) {
  const snapshot = await ensureSnapshot(userId);
  const nextSnapshot = {
    ...snapshot,
    lifecycle: {
      ...(snapshot.lifecycle || {}),
      training: {
        enrolled: true,
        enrolledAt: new Date().toISOString(),
        track: payload.track || 'offensive-security-mvp',
      },
    },
  };

  await StudentProfile.findOneAndUpdate({ userId }, { $set: { snapshot: nextSnapshot } });
  return nextSnapshot.lifecycle.training;
}

export async function completeModule(userId, moduleId) {
  const snapshot = await ensureSnapshot(userId);
  const completedModules = new Set(snapshot.lifecycle?.completedModules || []);
  completedModules.add(String(moduleId));

  const nextSnapshot = {
    ...snapshot,
    lifecycle: {
      ...(snapshot.lifecycle || {}),
      completedModules: Array.from(completedModules),
      lastCompletedAt: new Date().toISOString(),
    },
  };

  await StudentProfile.findOneAndUpdate({ userId }, { $set: { snapshot: nextSnapshot } });
  return {
    completedModules: nextSnapshot.lifecycle.completedModules,
    lastCompletedAt: nextSnapshot.lifecycle.lastCompletedAt,
  };
}

export async function joinCommunity(userId) {
  const snapshot = await ensureSnapshot(userId);
  const nextSnapshot = {
    ...snapshot,
    lifecycle: {
      ...(snapshot.lifecycle || {}),
      communityJoinedAt: snapshot.lifecycle?.communityJoinedAt || new Date().toISOString(),
    },
  };
  await StudentProfile.findOneAndUpdate({ userId }, { $set: { snapshot: nextSnapshot } });
  return { joined: true, joinedAt: nextSnapshot.lifecycle.communityJoinedAt };
}

export async function listSupervisedEngagements(userId) {
  const docs = await Pentest.find({
    $or: [
      { assignedTo: userId },
      { 'metadata.learningParticipants': userId },
    ],
    'metadata.learningMode': true,
  })
    .sort({ createdAt: -1 })
    .lean();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    title: doc.title || 'Learning Engagement',
    status: doc.status || 'pending',
    mentor: doc.metadata?.mentor || 'HSOCIETY Mentor',
    startedAt: doc.startedAt || doc.createdAt,
  }));
}

export async function refreshSkills(userId, payload = {}) {
  const snapshot = await ensureSnapshot(userId);
  const nextSnapshot = {
    ...snapshot,
    lifecycle: {
      ...(snapshot.lifecycle || {}),
      skillRefresh: {
        topic: payload.topic || 'web-security',
        notes: payload.notes || '',
        refreshedAt: new Date().toISOString(),
      },
    },
  };
  await StudentProfile.findOneAndUpdate({ userId }, { $set: { snapshot: nextSnapshot } });
  return nextSnapshot.lifecycle.skillRefresh;
}

export async function deployProfessional(userId, payload = {}) {
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.bootcampStatus !== 'completed') {
    user.bootcampStatus = 'completed';
    await user.save({ validateBeforeSave: false });
  }

  const snapshot = await ensureSnapshot(userId);
  const nextSnapshot = {
    ...snapshot,
    lifecycle: {
      ...(snapshot.lifecycle || {}),
      deployment: {
        status: payload.status || 'ready-for-deployment',
        role: payload.role || 'junior-pentester',
        deployedAt: new Date().toISOString(),
      },
    },
  };

  await StudentProfile.findOneAndUpdate({ userId }, { $set: { snapshot: nextSnapshot } });
  return nextSnapshot.lifecycle.deployment;
}
