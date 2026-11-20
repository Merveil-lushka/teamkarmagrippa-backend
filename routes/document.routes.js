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

router.use(protect);

// 👇 Ajout de 'technicien' dans toutes les routes d'action
router.post(
  '/',
  requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'),
  upload.single('fichier'),
  createDocument
);

router.get(
  '/me',
  requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'),
  listMyDocuments
);

router.get('/:id', getDocument);

router.put(
  '/:id',
  requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'),
  upload.single('fichier'),
  updateDocument
);

router.put(
  '/:id/publish',
  requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'),
  togglePublish
);

router.delete(
  '/:id',
  requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'),
  deleteDocument
);

module.exports = router;