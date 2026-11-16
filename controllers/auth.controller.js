const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

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

const register = async (req, res, next) => {
  try {
    const { nom, prenom, email, password } = req.body;
    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({ success: false, error: { message: 'Tous les champs sont requis', statusCode: 400 } });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: { message: 'Cet email est déjà utilisé', statusCode: 409 } });
    }
    const user = await User.create({ nom, prenom, email, password, role: 'technicien' });
    const token = signToken(user);
    return res.status(201).json({
      success: true,
      message: 'Compte créé (rôle technicien). Contactez un admin pour élever vos droits.',
      data: userResponse(user, token),
    });
  } catch (err) { return next(err); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: { message: 'email et password requis', statusCode: 400 } });
    }
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Email ou mot de passe incorrect', statusCode: 401 } });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: { message: 'Email ou mot de passe incorrect', statusCode: 401 } });
    }
    if (!user.actif) {
      return res.status(403).json({ success: false, error: { message: 'Compte désactivé', statusCode: 403 } });
    }
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const token = signToken(user);
    return res.status(200).json({ success: true, data: userResponse(user, token) });
  } catch (err) { return next(err); }
};

const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({ success: true, data: userResponse(req.user) });
  } catch (err) { return next(err); }
};

// 👇 NOUVELLE FONCTION : Modifier son propre profil
const updateMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'Utilisateur introuvable', statusCode: 404 } });
    }

    const { nom, prenom, password } = req.body;
    
    if (nom !== undefined) user.nom = nom;
    if (prenom !== undefined) user.prenom = prenom;
    
    // Si un nouveau mot de passe est fourni, on le met à jour (le hook pre-save va le hasher)
    if (password && password.trim().length >= 6) {
      user.password = password;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      data: userResponse(user),
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { register, login, getMe, updateMe };