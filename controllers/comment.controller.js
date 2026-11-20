const Comment = require('../models/Comment');
const Document = require('../models/Document');
const Notification = require('../models/Notification');

/**
 * POST /api/publications/:id/comments
 * Ajoute un commentaire et notifie le propriétaire du document.
 */
const addComment = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().isEmpty) {
      return res.status(400).json({ success: false, error: { message: 'Le texte est requis', statusCode: 400 } });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc || !doc.isPublished) {
      return res.status(404).json({ success: false, error: { message: 'Document introuvable ou non publié', statusCode: 404 } });
    }

    const comment = await Comment.create({
      document: doc._id,
      author: req.user._id,
      text: text.trim(),
      readBy: [req.user._id], // L'auteur a lu son propre commentaire
    });

    // 👇 Notification pour le propriétaire du document (si c'est pas lui-même)
    if (doc.owner.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: doc.owner,
        sender: req.user._id,
        type: 'comment',
        document: doc._id,
        message: `${req.user.prenom} a commenté votre publication "${doc.nom}"`,
      });
    }

    const populated = await comment.populate('author', 'nom prenom role');
    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/publications/:id/comments
 * Liste les commentaires et marque tous comme lus.
 */
const getComments = async (req, res, next) => {
  try {
    const comments = await Comment.find({ document: req.params.id })
      .populate('author', 'nom prenom role')
      .sort({ createdAt: -1 });

    // 👇 Marquer tous les commentaires de ce document comme lus
    await Comment.updateMany(
      { document: req.params.id, readBy: { $ne: req.user._id } },
      { $push: { readBy: req.user._id } }
    );

    return res.status(200).json({ success: true, count: comments.length, data: comments });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/publications/:docId/comments/:commentId
 * Supprime un commentaire (Admin ou Auteur uniquement).
 */
const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ success: false, error: { message: 'Commentaire introuvable', statusCode: 404 } });
    }

    // Vérification : Seul l'auteur ou un admin peut supprimer
    const isAuthor = comment.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: { message: 'Vous n\'êtes pas autorisé à supprimer ce commentaire', statusCode: 403 } 
      });
    }

    await comment.deleteOne();
    return res.status(200).json({ success: true, message: 'Commentaire supprimé avec succès' });
  } catch (err) {
    return next(err);
  }
};

module.exports = { addComment, getComments, deleteComment };