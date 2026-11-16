const express = require('express');
const router = express.Router();

const {
  createDocument,
  listMyDocuments,
  getDocument,
  updateDocument,
  togglePublish,
  deleteDocument,
} = require('../controllers/document.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');

// Toutes les routes nécessitent un JWT valide
router.use(protect);

/**
 * POST   /api/documents                 → upload (admin/secretaire/designer/dg)
 * GET    /api/documents/me              → mes documents (avec recherche)
 * GET    /api/documents/:id             → détail
 * PUT    /api/documents/:id             → modifier métadonnées et/ou remplacer le fichier
 * PUT    /api/documents/:id/publish     → publier/dépublier
 * DELETE /api/documents/:id             → supprimer (local + cloud)
 */

// Upload : multer traite le multipart/form-data AVANT le controller
router.post(
  '/',
  requireRole('admin', 'secretaire', 'designer', 'dg'),
  upload.single('fichier'), // ⚠️ AVANT createDocument (sinon req.file undefined)
  createDocument
);

// Liste avec recherche (filtres query string)
router.get(
  '/me',
  requireRole('admin', 'secretaire', 'designer', 'dg'),
  listMyDocuments
);

// Détail : admin, owner ou technicien (si publié) → géré dans le controller
router.get('/:id', getDocument);

// Modification métadonnées + possibilité de remplacer le fichier
router.put(
  '/:id',
  requireRole('admin', 'secretaire', 'designer', 'dg'),
  upload.single('fichier'), // 👈 AJOUTÉ ICI pour lire le nouveau fichier si présent
  updateDocument
);

// Publication
router.put(
  '/:id/publish',
  requireRole('admin', 'secretaire', 'designer', 'dg'),
  togglePublish
);

// Suppression
router.delete(
  '/:id',
  requireRole('admin', 'secretaire', 'designer', 'dg'),
  deleteDocument
);

module.exports = router;