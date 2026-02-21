/**
 * Community Socket handlers
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import CommunityMessage from '../models/CommunityMessage.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const MAX_MESSAGE_LENGTH = 500;

const sanitizeMessage = (value) => {
  const raw = String(value || '');
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
};

const normalizeRoom = (value) => String(value || '').trim();

const toMessagePayload = (doc) => ({
  id: doc._id.toString(),
  userId: doc.userId?.toString() || '',
  username: doc.username,
  room: doc.room,
  content: doc.content,
  createdAt: doc.createdAt
});

export const registerCommunitySocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded?.type === '2fa') {
        return next(new Error('Two-factor verification required'));
      }

      const userId = decoded?.sub;
      if (!userId) {
        return next(new Error('Invalid token'));
      }

      const user = await User.findById(userId).lean();
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.data.user = {
        id: user._id.toString(),
        username: user.name || 'Community Member'
      };

      return next();
    } catch (_err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('joinRoom', (room) => {
      const safeRoom = normalizeRoom(room);
      if (!safeRoom) return;
      socket.join(safeRoom);
    });

    socket.on('sendMessage', async (data) => {
      try {
        const room = normalizeRoom(data?.room || 'general');
        if (!room) return;

        const content = sanitizeMessage(data?.content ?? data?.message);
        if (!content) return;
        if (content.length > MAX_MESSAGE_LENGTH) return;

        const messageDoc = await CommunityMessage.create({
          userId: socket.data.user.id,
          username: socket.data.user.username,
          room,
          content
        });

        const payload = toMessagePayload(messageDoc.toObject());
        io.to(room).emit('receiveMessage', payload);
      } catch (err) {
        console.error('[SOCKET] sendMessage error:', err);
      }
    });
  });
};

export default registerCommunitySocket;
