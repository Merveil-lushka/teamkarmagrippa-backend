const User = require('../models/User');
const Counter = require('../models/Counter'); // 👈 Importation du compteur

const userResponse = (user) => ({
  id: user._id,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  agentCode: user.agentCode, // 👈 Ajouté
  role: user.role,
  actif: user.actif,
  canPublish: user.canPublish,
  lastLogin: user.lastLogin,
  createdBy: user.createdBy,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createUser = async (req, res, next) => {
  try {
    const { nom, prenom, email, password, role, canPublish } = req.body;

    if (!nom || !prenom || !password || !role) {
      return res.status(400).json({ success: false, error: { message: 'nom, prenom, password et role sont requis', statusCode: 400 } });
    }

    if (!User.ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: { message: `Rôle invalide`, statusCode: 400 } });
    }

    if (email) {
      const existing = await User.findOne({ email: String(email).toLowerCase() });
      if (existing) return res.status(409).json({ success: false, error: { message: 'Cet email est déjà utilisé', statusCode: 409 } });
    }

    // 👇 GÉNÉRATION DU CODE AGENT
    const year = new Date().getFullYear();
    const counter = await Counter.findByIdAndUpdate(
      'agent_code', 
      { $inc: { seq: 1 } }, 
      { new: true, upsert: true }
    );
    const agentCode = `TK${year}${counter.seq.toString().padStart(4, '0')}`;

    const user = await User.create({
      nom, prenom, email: email || undefined, 
      agentCode, // 👈 Ajouté ici
      password, role,
      canPublish: canPublish === true,
      createdBy: req.user._id,
    });

    return res.status(201).json({ success: true, data: userResponse(user) });
  } catch (err) {
    return next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.actif !== undefined) filter.actif = req.query.actif === 'true';
    const users = await User.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: users.length, data: users.map(userResponse) });
  } catch (err) { return next(err); }
};

const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: { message: 'Utilisateur introuvable', statusCode: 404 } });
    return res.status(200).json({ success: true, data: userResponse(user) });
  } catch (err) { return next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const { nom, prenom, role, actif, password, canPublish } = req.body;
    const targetId = req.params.id;
    const isSelf = targetId === req.user._id.toString();

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ success: false, error: { message: 'Utilisateur introuvable', statusCode: 404 } });

    if (isSelf && actif === false) return res.status(400).json({ success: false, error: { message: 'Vous ne pouvez pas désactiver votre propre compte', statusCode: 400 } });
    
    if (isSelf && role && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', actif: true });
      if (adminCount <= 1) return res.status(400).json({ success: false, error: { message: 'Impossible : vous êtes le dernier admin actif', statusCode: 400 } });
    }

    if (role && user.role === 'admin' && role !== 'admin') {
      const otherAdmins = await User.countDocuments({ role: 'admin', actif: true, _id: { $ne: user._id } });
      if (otherAdmins === 0) return res.status(400).json({ success: false, error: { message: 'Impossible : c\'est le dernier admin actif', statusCode: 400 } });
    }

    if (role && !User.ROLES.includes(role)) return res.status(400).json({ success: false, error: { message: `Rôle invalide`, statusCode: 400 } });

    if (nom !== undefined) user.nom = nom;
    if (prenom !== undefined) user.prenom = prenom;
    if (role !== undefined) user.role = role;
    if (actif !== undefined) user.actif = actif;
    if (canPublish !== undefined) user.canPublish = canPublish;
    if (password) user.password = password;

    await user.save();
    return res.status(200).json({ success: true, data: userResponse(user) });
  } catch (err) { return next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) return res.status(400).json({ success: false, error: { message: 'Vous ne pouvez pas supprimer votre propre compte', statusCode: 400 } });

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ success: false, error: { message: 'Utilisateur introuvable', statusCode: 404 } });

    if (user.role === 'admin' && user.actif) {
      const otherAdmins = await User.countDocuments({ role: 'admin', actif: true, _id: { $ne: user._id } });
      if (otherAdmins === 0) return res.status(400).json({ success: false, error: { message: 'Impossible : c\'est le dernier admin actif', statusCode: 400 } });
    }

    await user.deleteOne();
    return res.status(200).json({ success: true, message: 'Utilisateur supprimé', data: { id: targetId } });
  } catch (err) { return next(err); }
};

module.exports = { createUser, listUsers, getUser, updateUser, deleteUser };