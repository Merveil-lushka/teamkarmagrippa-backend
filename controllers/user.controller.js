const User = require('../models/User');

/**
 * Helper : formatte la réponse user (sans password).
 */
const userResponse = (user) => ({
  id: user._id,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  role: user.role,
  actif: user.actif,
  lastLogin: user.lastLogin,
  createdBy: user.createdBy,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * POST /api/users
 * Crée un utilisateur avec un rôle arbitraire.
 * @access Admin
 */
const createUser = async (req, res, next) => {
  try {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'nom, prenom, email, password et role sont requis',
          statusCode: 400,
        },
      });
    }

    if (!User.ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Rôle invalide. Valeurs autorisées : ${User.ROLES.join(', ')}`,
          statusCode: 400,
        },
      });
    }

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
      role,
      createdBy: req.user._id, // traçabilité
    });

    return res.status(201).json({
      success: true,
      data: userResponse(user),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/users
 * Liste tous les utilisateurs.
 * @access Admin
 */
const listUsers = async (req, res, next) => {
  try {
    // Filtres optionnels via query string
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.actif !== undefined) filter.actif = req.query.actif === 'true';

    const users = await User.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users.map(userResponse),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/users/:id
 * Détail d'un utilisateur.
 * @access Admin
 */
const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'Utilisateur introuvable', statusCode: 404 },
      });
    }
    return res.status(200).json({
      success: true,
      data: userResponse(user),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/users/:id
 * Modifie un utilisateur (nom, prenom, role, actif, password).
 * @access Admin
 */
const updateUser = async (req, res, next) => {
  try {
    const { nom, prenom, role, actif, password } = req.body;
    const targetId = req.params.id;
    const isSelf = targetId === req.user._id.toString();

    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'Utilisateur introuvable', statusCode: 404 },
      });
    }

    // ── Garde-fous ──────────────────────────────────────────
    // 1. Un admin ne peut pas se désactiver lui-même
    if (isSelf && actif === false) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Vous ne pouvez pas désactiver votre propre compte',
          statusCode: 400,
        },
      });
    }

    // 2. Un admin ne peut pas se rétrograder lui-même s'il est le dernier admin
    if (isSelf && role && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', actif: true });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Impossible : vous êtes le dernier admin actif',
            statusCode: 400,
          },
        });
      }
    }

    // 3. Si on change le rôle d'un admin, vérifier qu'il en reste au moins un
    if (role && user.role === 'admin' && role !== 'admin') {
      const otherAdmins = await User.countDocuments({
        role: 'admin',
        actif: true,
        _id: { $ne: user._id },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Impossible : c\'est le dernier admin actif de la plateforme',
            statusCode: 400,
          },
        });
      }
    }

    // 4. Validation du rôle
    if (role && !User.ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Rôle invalide. Valeurs autorisées : ${User.ROLES.join(', ')}`,
          statusCode: 400,
        },
      });
    }

    // ── Application des modifications ───────────────────────
    if (nom !== undefined) user.nom = nom;
    if (prenom !== undefined) user.prenom = prenom;
    if (role !== undefined) user.role = role;
    if (actif !== undefined) user.actif = actif;
    if (password) user.password = password; // re-hashé par le hook pre-save

    await user.save();

    return res.status(200).json({
      success: true,
      data: userResponse(user),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Supprime un utilisateur.
 * @access Admin
 */
const deleteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;

    // 1. Un admin ne peut pas se supprimer lui-même
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Vous ne pouvez pas supprimer votre propre compte',
          statusCode: 400,
        },
      });
    }

    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'Utilisateur introuvable', statusCode: 404 },
      });
    }

    // 2. Ne pas supprimer le dernier admin actif
    if (user.role === 'admin' && user.actif) {
      const otherAdmins = await User.countDocuments({
        role: 'admin',
        actif: true,
        _id: { $ne: user._id },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Impossible : c\'est le dernier admin actif de la plateforme',
            statusCode: 400,
          },
        });
      }
    }

    await user.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Utilisateur supprimé',
      data: { id: targetId },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createUser, listUsers, getUser, updateUser, deleteUser };