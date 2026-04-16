require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// ── Route imports ──────────────────────────────────────────────────────
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const applicationsRoutes = require('./routes/applications.routes');
const configRoutes = require('./routes/config.routes');

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// ── SECURITY & COMPRESSION ─────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(compression());

// ── CORS ───────────────────────────────────────────────────────────────
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500'
).split(',').map(o => o.trim());

const isDevelopment = (process.env.NODE_ENV || 'development') !== 'production';

app.use(cors({
  origin: (origin, callback) => {
    if (isDevelopment) return callback(null, true);
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin === 'null') return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── BODY PARSING ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── LOGGING ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── STATIC FILES (uploaded photos/docs) ───────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : './uploads');
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));
app.use(express.static(PUBLIC_DIR));

// ── GLOBAL RATE LIMIT ──────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
}));

// ── HEALTH CHECK ───────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { query } = require('./config/db');
    await query('SELECT 1');
    res.json({
      status: 'healthy', timestamp: new Date().toISOString(),
      version: '1.0.0', db: 'connected',
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected', error: err.message });
  }
});

// ── API ROUTES ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/config', configRoutes);

// ── API INDEX ──────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'GSRTC E-Pass API', version: '1.0.0',
    endpoints: {
      health: 'GET  /health',
      auth: {
        register: 'POST   /api/auth/register',
        login: 'POST   /api/auth/login',
        refresh: 'POST   /api/auth/refresh',
        logout: 'POST   /api/auth/logout',
        profile: 'GET    /api/auth/profile',
        updateProfile: 'PUT    /api/auth/profile',
        changePassword: 'PUT    /api/auth/change-password',
      },
      admin: {
        login: 'POST /api/admin/login',
        logout: 'POST /api/admin/logout',
        refresh: 'POST /api/admin/refresh',
        auditLogs: 'GET  /api/admin/audit-logs',
      },
      applications: {
        submit: 'POST  /api/applications',
        myApps: 'GET   /api/applications/my',
        downloads: 'GET   /api/applications/downloads',
        track: 'GET   /api/applications/track/:id',
        getOne: 'GET   /api/applications/:id',
        download: 'GET   /api/applications/:appId/download',
        adminAll: 'GET   /api/applications/admin/all',
        adminStats: 'GET   /api/applications/admin/stats',
        adminUsers: 'GET   /api/applications/admin/users',
        adminReview: 'PATCH /api/applications/admin/:id/review',
        toggleUser: 'PATCH /api/applications/admin/users/:userId/toggle',
      },
      config: {
        passTypes: 'GET  /api/config/pass-types',
        validityOptions: 'GET  /api/config/validity-options',
        calculateAmount: 'GET  /api/config/calculate-amount?passType=X&validity=Y',
        createPassType: 'POST /api/config/pass-types  [admin]',
        updatePassType: 'PUT  /api/config/pass-types/:id  [admin]',
      },
    },
  });
});

// ── FRONTEND ENTRYPOINTS ───────────────────────────────────────────────
const serveFrontend = (page) => (req, res, next) => {
  try {
    const fs = require('fs');
    let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    // Set the correct page as active (works with class="page-section active" or class="page-section")
    ['landing', 'portal', 'admin'].forEach((name) => {
      // First normalise — remove any existing active class from all sections
      html = html.replace(
        new RegExp(`(class="page-section)[^"]*(" id="page-${name}")`, 'g'),
        name === page ? '$1 active$2' : '$1$2'
      );
    });
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
};

app.get('/', serveFrontend('landing'));
app.get('/portal', serveFrontend('portal'));
app.get('/admin', serveFrontend('admin'));

// ── 404 HANDLER ────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── GLOBAL ERROR HANDLER ───────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS'))
    return res.status(403).json({ success: false, message: err.message });
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚌  GSRTC E-Pass Backend`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🌐  Server   : http://localhost:${PORT}`);
    console.log(`📋  API Docs : http://localhost:${PORT}/api`);
    console.log(`❤️   Health   : http://localhost:${PORT}/health`);
    console.log(`🔧  Mode     : ${process.env.NODE_ENV || 'development'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
}

module.exports = app;
