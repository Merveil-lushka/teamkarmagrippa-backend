const express = require('express');
const router = express.Router();

const { register, login, getMe } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/auth/register
 * @desc    Inscription publique (rôle forcé : technicien)
 * @access  Public
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Authentification, renvoie un JWT
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   GET /api/auth/me
 * @desc    Profil de l'utilisateur courant
 * @access  Privé (JWT requis)
 */
router.get('/me', protect, getMe);

module.exports = router;