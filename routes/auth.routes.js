const express = require('express');
const router = express.Router();

const { register, login, getMe, updateMe } = require('../controllers/auth.controller'); // 👈 Import de updateMe
const { protect } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');

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

/**
 * @route   PUT /api/auth/me
 * @desc    Mise à jour du profil de l'utilisateur connecté
 * @access  Privé (JWT requis)
 */
router.put('/me', protect, upload.single('profilePicture'), updateMe); // 👈 Nouvelle route ajoutée

module.exports = router;