const jwt = require('jsonwebtoken');
const fs = require('fs');
const User = require('../models/User');
const cloudinaryService = require('../services/cloudinary.service');

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
    agentCode: user.agentCode, // 👈 Ajouté
    role: user.role,
    actif: user.actif,
    canPublish: user.canPublish, // 👈 Ajouté
    profilePicture: user.profilePicture,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
  if (token) data.token = token;
  return data;
};

// (Optionnel) On garde le register public mais on ne l'utilise plus vraiment
const register = async (req, res, next) => {
  try {
    const { nom, prenom, email, password } = req.body;
    if (!nom || !prenom || !password) {
      return res.status(400).json({ success: false, error: { message: 'Tous les champs sont requis', statusCode: 400 } });
    }
    
    // On génère un code agent temporaire pour l'inscription publique
    const year = new Date().getFullYear();
    const count = await User.countDocuments();
    const agentCode = `TK${year}${(count + 1).toString().padStart(4, '0')}`;

    const user = await User.create({ nom, prenom, email, password, agentCode, role: 'technicien' });
    const token = signToken(user);
    return res.status(201).json({ success: true, data: userResponse(user, token) });
  } catch (err) { return next(err); }
};

// 👇 MODIFICATION ICI : Login par Code Agent
const login = async (req, res, next) => {
  try {
    const { agentCode, password } = req.body;
    if (!agentCode || !password) {
      return res.status(400).json({ success: false, error: { message: 'Code Agent et mot de passe requis', statusCode: 400 } });
    }
    
    // On cherche par agentCode
    const user = await User.findOne({ agentCode: agentCode.toUpperCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Code Agent ou mot de passe incorrect', statusCode: 401 } });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: { message: 'Code Agent ou mot de passe incorrect', statusCode: 401 } });
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

const updateMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'Utilisateur introuvable', statusCode: 404 } });
    }

    const { nom, prenom, password } = req.body;
    if (nom !== undefined) user.nom = nom;
    if (prenom !== undefined) user.prenom = prenom;
    if (password && password.trim().length >= 6) user.password = password;

    // 👇 Gestion de l'image de profil
    if (req.file) {
      // Upload sur Cloudinary
      if (cloudinaryService.isEnabled()) {
        // On peut supprimer l'ancienne image si elle existe
        // if (user.profilePicture) {
        //   const publicId = user.profilePicture.split('/').pop().split('.')[0];
        //   await cloudinaryService.deleteFromCloud(`teamkarmagrippa/avatars/${publicId}`);
        // }
        
        const cloudResult = await cloudinaryService.uploadToCloud(req.file.path, { 
          mimeType: req.file.mimetype, 
          folder: `teamkarmagrippa/avatars` 
        });
        
        if (cloudResult.url) {
          user.profilePicture = cloudResult.url;
        }
      }
      // Nettoyage du fichier local temporaire
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }

    await user.save();

    return res.status(200).json({
      success: true,
      data: userResponse(user), // N'oublie pas d'ajouter profilePicture dans userResponse
    });
  } catch (err) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    return next(err);
  }
};

module.exports = { register, login, getMe, updateMe };