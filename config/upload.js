const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Configuration Multer pour l'upload local.
 * Les fichiers sont stockés dans :
 *   {STORAGE_LOCAL_PATH}/{userId}/{dossierId}/{timestamp}-{random}.ext
 *
 * Le service Cloudinary prend le relais APRÈS (double écriture) via
 * services/cloudinary.service.js, appelé par le controller.
 */

const STORAGE_ROOT = process.env.STORAGE_LOCAL_PATH || './uploads';

/**
 * Crée les dossiers récursivement si besoin.
 */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Tous les MIME autorisés (union des types définis dans Document.MIME_MAP).
 * Importé dynamiquement pour éviter une duplication de la liste.
 */
const getAllowedMimes = () => {
  const Document = require('../models/Document');
  const set = new Set();
  Object.values(Document.MIME_MAP).forEach((list) => {
    list.forEach((m) => set.add(m));
  });
  set.delete('*/*'); // on refuse le wildcard global pour la sécurité
  return set;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = req.user ? req.user._id.toString() : 'anon';
      const dossierId = req.params.dossierId || 'sans-dossier';
      const dir = path.join(STORAGE_ROOT, userId, dossierId);
      ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  try {
    const allowed = getAllowedMimes();
    if (allowed.has(file.mimetype)) {
      return cb(null, true);
    }
    const error = new Error(`Type de fichier non autorisé : ${file.mimetype}`);
    error.statusCode = 400;
    return cb(error);
  } catch (err) {
    return cb(err);
  }
};

/**
 * Instance Multer prête à l'emploi.
 * Limite : 5 Go (5 * 1024 * 1024 * 1024 octets) par fichier.
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 👈 5 Go
    files: 1,
  },
});

module.exports = { upload, STORAGE_ROOT, ensureDir };