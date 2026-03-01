/**
 * Hsociety OffSec - Express.js API Server
 * Entry: server/index.js
 *
 * Start: npm run dev (development) | npm start (production)
 * API base: http://localhost:3000/api/v1
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import mongoose from 'mongoose';
import { connectDB } from './db/index.js';
import registerCommunitySocket from './sockets/community.socket.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import pentestRoutes from './routes/pentest.routes.js';
import auditsRoutes from './routes/audits.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import communityRoutes from './routes/community.routes.js';
import studentRoutes from './routes/student.routes.js';
import profileRoutes from './routes/profile.routes.js';
import adminRoutes from './routes/admin.routes.js';
import publicRoutes from './routes/public.routes.js';
import engagementsRoutes from './routes/engagements.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import remediationRoutes from './routes/remediation.routes.js';
import assetsRoutes from './routes/assets.routes.js';
import billingRoutes from './routes/billing.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import pentestersRoutes from './routes/pentesters.routes.js';
import User from './models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { API_CONFIG } from './config/endpoints.config.js';
import { SecurityEvent } from './models/index.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIX = API_CONFIG.PREFIX;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}

const normalizeOrigin = (origin = '') => {
  const cleaned = String(origin).trim().replace(/\/+$/, '');
  if (!cleaned) return '';

  try {
    return new URL(cleaned).origin;
  } catch {
    return cleaned;
  }
};

const parseAllowedOrigins = () => {
  const fromList = (process.env.FRONTEND_URLS || '')
    .split(',')
    .map(origin => normalizeOrigin(origin))
    .filter(Boolean);

  const fromSingle = process.env.FRONTEND_URL ? [normalizeOrigin(process.env.FRONTEND_URL)] : [];
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://hsocietyoffsec.netlify.app'
  ];

  return [...new Set([...fromList, ...fromSingle, ...defaults].map(normalizeOrigin).filter(Boolean))];
};

const allowedOrigins = parseAllowedOrigins();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
    },
    credentials: true
  }
});

registerCommunitySocket(io);

// ============================================
// Middleware
// ============================================

// SECURITY UPDATE IMPLEMENTED: Helmet with HSTS, X-Frame-Options, Referrer-Policy
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.set('trust proxy', 1);
// SECURITY UPDATE IMPLEMENTED: Parse cookies for refresh token
app.use(cookieParser());
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (e.g. health checks, curl, server-to-server).
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// SECURITY UPDATE IMPLEMENTED: Rate limiting - 100 general per 15 min; auth has stricter limit in auth routes
const requestBuckets = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;
const AUTH_RATE_LIMIT_MAX = 12;

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
};

const requestRateLimiter = (req, res, next) => {
  const ip = getClientIp(req);
  const key = `${ip}:${req.path.startsWith('/api/auth') ? 'auth' : 'api'}`;
  const now = Date.now();
  const limit = req.path.startsWith('/api/auth') ? AUTH_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
  const bucket = requestBuckets.get(key);

  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    requestBuckets.set(key, { count: 1, startedAt: now });
    return next();
  }

  if (bucket.count >= limit) {
    res.setHeader('Retry-After', String(Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  bucket.count += 1;
  requestBuckets.set(key, bucket);
  return next();
};

const attachSecurityContext = (req, _res, next) => {
  req.requestContext = {
    ipAddress: getClientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
    deviceId: String(req.headers['x-device-id'] || '').slice(0, 128),
  };
  next();
};

const securityEventLogger = (req, res, next) => {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/public/security-events')) {
    return next();
  }

  res.on('finish', async () => {
    const statusCode = Number(res.statusCode || 0);
    if (statusCode < 400 && req.method === 'GET') return;

    let userId = null;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || null;
      } catch {
        userId = null;
      }
    }

    try {
      await SecurityEvent.create({
        eventType: statusCode >= 400 ? 'api_error' : 'api_activity',
        action: req.method,
        path: req.path,
        method: req.method,
        statusCode,
        ipAddress: req.requestContext?.ipAddress || '',
        macAddress: 'unavailable',
        userAgent: req.requestContext?.userAgent || '',
        deviceId: req.requestContext?.deviceId || '',
        userId,
        metadata: {
          query: req.query,
        },
      });
    } catch (err) {
      console.error('[SECURITY] Failed to write security event:', err.message);
    }
  });

  next();
};

app.use(attachSecurityContext);
app.use(requestRateLimiter);
app.use(securityEventLogger);

// ============================================
// Health Check
// ============================================

app.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    mongodb: dbOk ? 'connected' : ['disconnected', 'connecting', 'disconnecting', 'connected'][dbState] || 'unknown',
  });
});

// ============================================
// API Routes
// ============================================

app.use(`${API_PREFIX}${API_CONFIG.ROUTES.AUTH}`, authRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.DASHBOARD}`, dashboardRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.PENTEST}`, pentestRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.AUDITS}`, auditsRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.FEEDBACK}`, feedbackRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.COMMUNITY}`, communityRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.STUDENT}`, studentRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.PROFILE}`, profileRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.ADMIN}`, adminRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.PUBLIC}`, publicRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.ENGAGEMENTS}`, engagementsRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.REPORTS}`, reportsRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.REMEDIATION}`, remediationRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.ASSETS}`, assetsRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.BILLING}`, billingRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.NOTIFICATIONS}`, notificationsRoutes);
app.use(`${API_PREFIX}${API_CONFIG.ROUTES.PENTESTERS}`, pentestersRoutes);

// ============================================
// 404 Handler
// ============================================

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', path: _req.path });
});

// ============================================
// Error Handler
// ============================================

app.use((err, _req, res, _next) => {
  console.error('[SERVER] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ============================================
// Start Server (after MongoDB connection)
// ============================================

async function start() {
  try {
    await connectDB();

    // Seed admin from ENV if not present
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    const adminName = process.env.ADMIN_NAME || 'Admin';
    const adminOrganization = process.env.ADMIN_ORG || '';

    if (adminEmail && adminPassword) {
      const existingAdmin = await User.findOne({ role: 'admin' }).lean();
      if (!existingAdmin) {
        // SECURITY UPDATE IMPLEMENTED: bcrypt 12 for admin seed
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await User.create({
          email: adminEmail,
          passwordHash,
          name: adminName,
          organization: adminOrganization,
          role: 'admin',
          emailVerified: true,
        });
        console.log(`[HSOCIETY] Seeded admin user: ${adminEmail}`);
      }
    }

    server.listen(PORT, () => {
      console.log(`[HSOCIETY] API server running at http://localhost:${PORT}${API_PREFIX}`);
    });
  } catch (err) {
    console.error('[HSOCIETY] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
