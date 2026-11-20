require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const dossierRoutes = require('./routes/dossier.routes');
const documentRoutes = require('./routes/document.routes');
const publicationRoutes = require('./routes/publication.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

// ── Middlewares globaux ─────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS minimaliste (à durcir plus tard si besoin)
app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ── Fichiers statiques (uploads locaux) ─────────────────────
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '1d',
    fallthrough: true,
  })
);

// ── Routes de santé ────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '✅ TeamKarmagrippa Cloud API running',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.status(200).json({
    success: true,
    server: 'up',
    database: dbState,
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
});

// ── Route de mise à jour de l'application (OTA) ─────────────
app.get('/api/version', (req, res) => {
  res.status(200).json({
    latestVersion: "1.0.1", // 👈 Change ce numéro à chaque nouvel APK
    downloadUrl: "https://res.cloudinary.com/edkghtu3/raw/upload/v1234567890/teamkarmagrippa/app-release.apk", // 👈 Lien Cloudinary de ton APK
    forceUpdate: false, // Mets 'true' si tu veux forcer la mise à jour
  });
});

// ── Routes API ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dossiers', dossierRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/notifications', notificationRoutes);

// ── Middlewares d'erreurs (TOUJOURS en dernier) ─────────────
app.use(notFound);
app.use(errorHandler);

// ── Démarrage ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('🚀 TeamKarmagrippa Cloud API');
      console.log(`   ▸ Env   : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   ▸ Port  : ${PORT}`);
      console.log(`   ▸ URL   : http://localhost:${PORT}`);
      console.log('═══════════════════════════════════════════════');
      console.log('');
    });

    // Arrêt propre (Ctrl+C, kill, docker stop…)
    const shutdown = (signal) => {
      console.log(`\n⚠️  ${signal} reçu — arrêt du serveur…`);
      server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
      });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Impossible de démarrer le serveur :', err.message);
    process.exit(1);
  }
};

start();

module.exports = app;