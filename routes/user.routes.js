const express = require('express');
const router = express.Router();

const {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
} = require('../controllers/user.controller');
const { protect, requireRole } = require('../middleware/auth.middleware');

// ── Toutes les routes ci-dessous nécessitent un JWT valide ET le rôle admin ──
router.use(protect);
router.use(requireRole('admin'));

/**
 * @route   POST /api/users
 * @desc    Créer un utilisateur avec un rôle arbitraire
 * @access  Admin
 */
router.post('/', createUser);

/**
 * @route   GET /api/users
 * @desc    Lister tous les utilisateurs (filtres ?role=admin&actif=true)
 * @access  Admin
 */
router.get('/', listUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Détail d'un utilisateur
 * @access  Admin
 */
router.get('/:id', getUser);

/**
 * @route   PUT /api/users/:id
 * @desc    Modifier un utilisateur (nom, prenom, role, actif, password)
 * @access  Admin
 */
router.put('/:id', updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Supprimer un utilisateur
 * @access  Admin
 */
router.delete('/:id', deleteUser);

module.exports = router;