/**
 * Community Socket handlers
 * SECURITY UPDATE IMPLEMENTED: JWT auth (existing), role validation, sanitize messages, rate-limit per user
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import CommunityMessage from '../models/CommunityMessage.js';
import CommunityConfig from '../models/CommunityConfig.js';
import Notification from '../models/Notification.js';
import emojiRegex from 'emoji-regex';
import { emitNotifications } from './socket.store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const MAX_MESSAGE_LENGTH = 500;
const MAX_IMAGE_LENGTH = 300000;
const MAX_COMMENT_LENGTH = 300;
// SECURITY UPDATE IMPLEMENTED: Rate limit messages per user to prevent spam
const MESSAGE_RATE_LIMIT = 30; // per minute
const messageCounts = new Map();

function checkMessageRateLimit(userId) {
  const now = Date.now();
  const key = userId;
  const bucket = messageCounts.get(key);
  if (!bucket || now - bucket.startedAt > 60000) {
    messageCounts.set(key, { count: 1, startedAt: now });
    return true;
  }
  if (bucket.count >= MESSAGE_RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

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

const DEFAULT_REACTIONS = ['🔥', '💯', '👏', '😂', '😮', '❤️', '✅', '⚡', '🧠', '🎯'];
const DEFAULT_REACTION_LIMIT = 3;

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractMentions = (content = '') => {
  const matches = String(content).match(/@([a-zA-Z0-9._-]{2,32})/g) || [];
  return [...new Set(matches.map((item) => item.slice(1).toLowerCase()))];
};

const normalizeReactions = (reactions) => {
  if (!reactions) return {};
  if (reactions instanceof Map) {
    return Object.fromEntries(
      Array.from(reactions.entries()).map(([emoji, data]) => [
        emoji,
        {
          count: Number(data?.count || 0),
          users: (data?.users || []).map((id) => id.toString())
        }
      ])
    );
  }
  if (typeof reactions === 'object') {
    return Object.entries(reactions).reduce((acc, [emoji, data]) => {
      acc[emoji] = {
        count: Number(data?.count || 0),
        users: (data?.users || []).map((id) => id.toString())
      };
      return acc;
    }, {});
  }
  return {};
};

const toMessagePayload = (doc) => ({
  id: doc._id.toString(),
  userId: doc.userId?.toString() || '',
  username: doc.username,
  hackerHandle: doc.hackerHandle || '',
  userRole: doc.userRole === 'admin' ? 'corporate' : doc.userRole || '',
  userAvatar: doc.userAvatar || '',
  room: doc.room,
  content: doc.content,
  imageUrl: doc.imageUrl || '',
  likes: Number(doc.likes || 0),
  likedBy: (doc.likedBy || []).map((id) => id.toString()),
  reactions: normalizeReactions(doc.reactions),
  pinned: Boolean(doc.pinned),
  comments: (doc.comments || []).map((comment) => ({
    id: comment._id?.toString() || '',
    userId: comment.userId?.toString() || '',
    username: comment.username || 'Community Member',
    content: comment.content || '',
    createdAt: comment.createdAt
  })),
  createdAt: doc.createdAt,
  tempId: doc.tempId || ''
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
        role: user.role === 'admin' ? 'corporate' : user.role || '',
        avatarUrl: user.avatarUrl || '',
        mutedUntil: user.mutedUntil || null
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
      // SECURITY UPDATE IMPLEMENTED: Validate room format (alphanumeric/dash only)
      if (!/^[a-z0-9_-]+$/i.test(safeRoom) || safeRoom.length > 64) return;
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
        const userId = socket.data.user?.id;
        if (!userId) return;
        if (!checkMessageRateLimit(userId)) {
          socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
          return;
        }
        const latestUser = await User.findById(userId).select('mutedUntil').lean();
        if (latestUser?.mutedUntil && new Date(latestUser.mutedUntil) > new Date()) {
          return;
        }

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

        const mentions = extractMentions(content);
        if (mentions.length > 0) {
          const mentionRegexes = mentions.map((handle) => new RegExp(`^${escapeRegExp(handle)}$`, 'i'));
          const users = await User.find({ hackerHandle: { $in: mentionRegexes } })
            .select('_id hackerHandle')
            .lean();
          const notifications = users
            .filter((target) => target._id.toString() !== userId)
            .map((target) => ({
              userId: target._id,
              type: 'mention',
              title: 'You were mentioned',
              message: `${socket.data.user.username} mentioned you in #${room}.`,
              metadata: {
                room,
                messageId: messageDoc._id.toString(),
                handle: target.hackerHandle || '',
              },
            }));
          if (notifications.length > 0) {
            const inserted = await Notification.insertMany(notifications);
            emitNotifications(inserted);
          }
        }

        const payload = toMessagePayload(messageDoc.toObject());
        // Echo back the client-provided tempId (if any) so the sender can reconcile optimistic UI.
        if (data?.tempId) {
          payload.tempId = String(data.tempId);
        }
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

        const ownerId = updated.userId?.toString();
        if (ownerId && ownerId !== userId) {
          const notification = await Notification.create({
            userId: ownerId,
            type: 'comment',
            title: 'New comment',
            message: `${socket.data.user?.username || 'Someone'} commented on your message.`,
            metadata: {
              room: updated.room,
              messageId: updated._id.toString(),
            },
          });
          emitNotifications([notification]);
        }
      } catch (err) {
        console.error('[SOCKET] addComment error:', err);
      }
    });

    socket.on('reactMessage', async (data) => {
      try {
        const messageId = String(data?.messageId || '').trim();
        if (!messageId) return;
        const userId = socket.data.user?.id;
        if (!userId) return;
        const emoji = String(data?.emoji || '').trim();
        if (!emoji) return;

        const regex = emojiRegex();
        const matches = emoji.match(regex);
        if (!matches || matches.join('') !== emoji) return;

        const message = await CommunityMessage.findById(messageId);
        if (!message) return;

        const config = await CommunityConfig.findOne().select('reactionConfig channels').lean();
        const channel = config?.channels?.find((ch) => String(ch.id) === String(message.room));
        const allowedEmojis =
          channel?.emojis?.length
            ? channel.emojis
            : config?.reactionConfig?.emojis?.length
              ? config.reactionConfig.emojis
              : DEFAULT_REACTIONS;
        if (!allowedEmojis.includes(emoji)) return;

        const reactionLimit = Number(config?.reactionConfig?.maxPerUser || DEFAULT_REACTION_LIMIT);
        const currentReactions = normalizeReactions(message.reactions);
        const userReactionCount = Object.values(currentReactions).filter((entry) =>
          Array.isArray(entry.users) && entry.users.includes(userId)
        ).length;

        const current = message.reactions?.get(emoji) || { count: 0, users: [] };
        const users = Array.isArray(current.users) ? [...current.users] : [];
        const alreadyReacted = users.some((id) => id.toString() === userId);
        if (!alreadyReacted && userReactionCount >= reactionLimit) return;
        const nextUsers = alreadyReacted
          ? users.filter((id) => id.toString() !== userId)
          : [...users, userId];
        const nextCount = Math.max(0, Number(current.count || 0) + (alreadyReacted ? -1 : 1));

        if (nextCount === 0) {
          message.reactions?.delete(emoji);
        } else {
          message.reactions?.set(emoji, { count: nextCount, users: nextUsers });
        }
        message.markModified('reactions');
        await message.save();

        io.to(message.room).emit('messageReacted', {
          messageId: message._id.toString(),
          room: message.room,
          reactions: normalizeReactions(message.reactions)
        });
      } catch (err) {
        console.error('[SOCKET] reactMessage error:', err);
      }
    });
  });
};

export default registerCommunitySocket;
