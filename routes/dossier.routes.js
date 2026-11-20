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

router.use(protect);

// 👇 Ajout de 'technicien' ICI
router.use(requireRole('admin', 'secretaire', 'designer', 'dg', 'technicien'));

router.route('/')
  .post(createDossier)
  .get(listDossiers);

router.route('/:id')
  .get(getDossier)
  .put(updateDossier)
  .delete(deleteDossier);

module.exports = router;