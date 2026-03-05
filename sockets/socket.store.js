let ioInstance = null;

export const setSocketServer = (io) => {
  ioInstance = io;
};

export const getSocketServer = () => ioInstance;

const toNotificationPayload = (doc) => ({
  id: doc._id?.toString?.() || doc.id,
  type: doc.type,
  title: doc.title,
  message: doc.message,
  read: Boolean(doc.read),
  createdAt: doc.createdAt,
  metadata: doc.metadata || {},
});

export const emitNotification = (notificationDoc) => {
  if (!ioInstance || !notificationDoc) return;
  const userId = notificationDoc.userId?.toString?.() || notificationDoc.userId;
  if (!userId) return;
  ioInstance.to(`user:${userId}`).emit('notification:new', toNotificationPayload(notificationDoc));
};

export const emitNotifications = (notificationDocs = []) => {
  if (!ioInstance || !Array.isArray(notificationDocs)) return;
  notificationDocs.forEach((doc) => emitNotification(doc));
};

export default {
  setSocketServer,
  getSocketServer,
  emitNotification,
  emitNotifications,
};
