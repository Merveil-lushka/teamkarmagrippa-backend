const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Helper : signe un JWT avec l'id et le rôle de l'utilisateur.
 */
const signToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Helper : formatte la réponse utilisateur.
 * Ne renvoie JAMAIS le password (déjà exclu par toJSON.transform, mais
 * ceinture + bretelles côté controller).
 */
const userResponse = (user, token = null) => {
  const data = {
    id: user._id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role,
    actif: user.actif,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
  if (token) data.token = token;
  return data;
};

/**
 * POST /api/auth/register
 * Inscription PUBLIQUE. Le rôle est TOUJOURS forcé à "technicien".
 * L'admin créera les autres rôles via une route dédiée (étape ultérieure).
 */
const register = async (req, res, next) => {
  try {
    const { nom, prenom, email, password } = req.body;

    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'nom, prenom, email et password sont requis',
          statusCode: 400,
        },
      });
    }

    // Vérification explicite de doublon (l'index unique MongoDB renvoie 11000,
    // mais on veut un message français clair)
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { message: 'Cet email est déjà utilisé', statusCode: 409 },
      });
    }

    const user = await User.create({
      nom,
      prenom,
      email,
      password,
      role: 'technicien', // ⚠️ forcé, on ignore un éventuel "role" dans le body
    });

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: 'Compte créé (rôle technicien). Contactez un admin pour élever vos droits.',
      data: userResponse(user, token),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/auth/login
 * Authentifie un utilisateur et renvoie un JWT.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'email et password requis', statusCode: 400 },
      });
    }

    // +password : nécessaire pour comparePassword (le champ est select:false)
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');

    // Message identique pour email inconnu ET mauvais mdp (évite l'énumération)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Email ou mot de passe incorrect', statusCode: 401 },
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { message: 'Email ou mot de passe incorrect', statusCode: 401 },
      });
    }

    if (!user.actif) {
      return res.status(403).json({
        success: false,
        error: { message: 'Compte désactivé', statusCode: 403 },
      });
    }

    // Mise à jour de lastLogin (validateBeforeSave:false car seul lastLogin change)
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      data: userResponse(user, token),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/auth/me
 * Renvoie le profil de l'utilisateur courant (req.user injecté par protect).
 */
const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: userResponse(req.user),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { register, login, getMe };