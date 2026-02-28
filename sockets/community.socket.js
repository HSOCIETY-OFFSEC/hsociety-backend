/**
 * Community Socket handlers
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import CommunityMessage from '../models/CommunityMessage.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const MAX_MESSAGE_LENGTH = 500;
const MAX_IMAGE_LENGTH = 300000;
const MAX_COMMENT_LENGTH = 300;

const sanitizeMessage = (value) => {
  const raw = String(value || '');
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
};

const normalizeRoom = (value) => String(value || '').trim();

const isValidImageUrl = (value) => {
  if (!value) return false;
  if (typeof value !== 'string') return false;
  if (value.length > MAX_IMAGE_LENGTH) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  return false;
};

const toMessagePayload = (doc) => ({
  id: doc._id.toString(),
  userId: doc.userId?.toString() || '',
  username: doc.username,
  hackerHandle: doc.hackerHandle || '',
  userRole: doc.userRole || '',
  userAvatar: doc.userAvatar || '',
  room: doc.room,
  content: doc.content,
  imageUrl: doc.imageUrl || '',
  likes: Number(doc.likes || 0),
  likedBy: (doc.likedBy || []).map((id) => id.toString()),
  comments: (doc.comments || []).map((comment) => ({
    id: comment._id?.toString() || '',
    userId: comment.userId?.toString() || '',
    username: comment.username || 'Community Member',
    content: comment.content || '',
    createdAt: comment.createdAt
  })),
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
        username: user.name || 'Community Member',
        hackerHandle: user.hackerHandle || '',
        role: user.role || '',
        avatarUrl: user.avatarUrl || ''
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

    socket.on('leaveRoom', (room) => {
      const safeRoom = normalizeRoom(room);
      if (!safeRoom) return;
      socket.leave(safeRoom);
    });

    socket.on('sendMessage', async (data) => {
      try {
        const room = normalizeRoom(data?.room || 'general');
        if (!room) return;

        const content = sanitizeMessage(data?.content ?? data?.message);
        const imageUrl = String(data?.imageUrl || '').trim();
        const hasImage = isValidImageUrl(imageUrl);
        if (!content && !hasImage) return;
        if (content.length > MAX_MESSAGE_LENGTH) return;

        const messageDoc = await CommunityMessage.create({
          userId: socket.data.user.id,
          username: socket.data.user.username,
          hackerHandle: socket.data.user.hackerHandle || '',
          userRole: socket.data.user.role || '',
          userAvatar: socket.data.user.avatarUrl || '',
          room,
          content,
          imageUrl: hasImage ? imageUrl : ''
        });

        const payload = toMessagePayload(messageDoc.toObject());
        io.to(room).emit('receiveMessage', payload);
      } catch (err) {
        console.error('[SOCKET] sendMessage error:', err);
      }
    });

    socket.on('typing', (data) => {
      const room = normalizeRoom(data?.room || 'general');
      if (!room) return;
      const isTyping = Boolean(data?.isTyping);

      io.to(room).emit('typing', {
        room,
        userId: socket.data.user?.id || '',
        username: socket.data.user?.username || 'Community Member',
        isTyping
      });
    });

    socket.on('likeMessage', async (data) => {
      try {
        const messageId = String(data?.messageId || '').trim();
        if (!messageId) return;
        const userId = socket.data.user?.id;
        if (!userId) return;

        const message = await CommunityMessage.findById(messageId).lean();
        if (!message) return;

        const alreadyLiked = (message.likedBy || []).some((id) => id.toString() === userId);
        const update = alreadyLiked
          ? { $pull: { likedBy: userId }, $inc: { likes: -1 } }
          : { $addToSet: { likedBy: userId }, $inc: { likes: 1 } };

        const updated = await CommunityMessage.findByIdAndUpdate(messageId, update, { new: true });
        if (!updated) return;

        if (updated.likes < 0) {
          updated.likes = 0;
          await updated.save();
        }

        io.to(updated.room).emit('messageLiked', {
          messageId: updated._id.toString(),
          room: updated.room,
          likes: updated.likes,
          likedBy: updated.likedBy.map((id) => id.toString())
        });
      } catch (err) {
        console.error('[SOCKET] likeMessage error:', err);
      }
    });

    socket.on('addComment', async (data) => {
      try {
        const messageId = String(data?.messageId || '').trim();
        if (!messageId) return;
        const content = sanitizeMessage(data?.content);
        if (!content || content.length > MAX_COMMENT_LENGTH) return;
        const userId = socket.data.user?.id;
        if (!userId) return;

        const comment = {
          userId,
          username: socket.data.user?.username || 'Community Member',
          content,
          createdAt: new Date()
        };

        const updated = await CommunityMessage.findByIdAndUpdate(
          messageId,
          { $push: { comments: comment } },
          { new: true }
        );
        if (!updated) return;

        const savedComment = updated.comments[updated.comments.length - 1];
        io.to(updated.room).emit('commentAdded', {
          messageId: updated._id.toString(),
          room: updated.room,
          comment: {
            id: savedComment._id?.toString() || '',
            userId: savedComment.userId?.toString() || '',
            username: savedComment.username || 'Community Member',
            content: savedComment.content || '',
            createdAt: savedComment.createdAt
          }
        });
      } catch (err) {
        console.error('[SOCKET] addComment error:', err);
      }
    });
  });
};

export default registerCommunitySocket;
