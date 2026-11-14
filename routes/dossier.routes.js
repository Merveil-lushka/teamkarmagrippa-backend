const express = require('express');
const router = express.Router();

const {
  createDossier,
  listDossiers,
  getDossier,
  updateDossier,
  deleteDossier,
} = require('../controllers/dossier.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

// Toutes les routes nécessitent un JWT valide
router.use(protect);

// Technicien n'a AUCUN accès aux dossiers (bloqué au niveau middleware)
router.use(requireRole('admin', 'secretaire', 'designer', 'dg'));

/**
 * POST   /api/dossiers          → créer (chacun dans son espace)
 * GET    /api/dossiers          → lister (admin: tous | autres: les siens)
 * GET    /api/dossiers/:id      → détail (admin | owner)
 * PUT    /api/dossiers/:id      → modifier (admin | owner)
 * DELETE /api/dossiers/:id      → supprimer (admin | owner)
 */
router.route('/')
  .post(createDossier)
  .get(listDossiers);

router.route('/:id')
  .get(getDossier)
  .put(updateDossier)
  .delete(deleteDossier);

module.exports = router;