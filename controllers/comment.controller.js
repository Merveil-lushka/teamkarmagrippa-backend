const Comment = require('../models/Comment');
const Document = require('../models/Document');

/**
 * POST /api/publications/:id/comments
 * Ajoute un commentaire sur un document publié.
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
    });

    // On recharge le commentaire avec les infos de l'auteur pour l'envoyer au front
    const populated = await comment.populate('author', 'nom prenom role');

    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/publications/:id/comments
 * Liste les commentaires d'un document publié.
 */
const getComments = async (req, res, next) => {
  try {
    const comments = await Comment.find({ document: req.params.id })
      .populate('author', 'nom prenom role')
      .sort({ createdAt: -1 }); // Du plus récent au plus ancien

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