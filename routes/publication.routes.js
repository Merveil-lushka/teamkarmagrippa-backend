const express = require('express');
const router = express.Router();

const Document = require('../models/Document');
const Publication = require('../models/Publication');
const { protect } = require('../middleware/auth.middleware');

// Toutes les routes nécessitent un JWT valide
router.use(protect);

/**
 * GET /api/publications
 * Liste TOUS les documents publiés. Accessible à TOUS les rôles connectés
 * (y compris technicien, c'est le but).
 * Filtres : ?type=devis&mois=11&annee=2026&client=Dupont&chantier=Pins
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = { isPublished: true };

    if (req.query.type) filter.type = req.query.type;
    if (req.query.mois) filter.mois = Number(req.query.mois);
    if (req.query.annee) filter.annee = Number(req.query.annee);
    if (req.query.client) filter.entrepriseCliente = new RegExp(req.query.client, 'i');
    if (req.query.chantier) filter.nomChantier = new RegExp(req.query.chantier, 'i');

    let projection = {};
    let sort = { publishedAt: -1 };
    if (req.query.q) {
      filter.$text = { $search: req.query.q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const docs = await Document.find(filter, projection)
      .select('type nom description entrepriseCliente nomChantier dateDocument mois annee fichier.urlCloud fichier.urlLocale fichier.mimeType fichier.size publishedAt owner')
      .populate('owner', 'nom prenom role')
      .sort(sort);

    return res.status(200).json({
      success: true,
      count: docs.length,
      data: docs,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/publications/:id
 * Détail d'un document publié (visible par tous les rôles connectés).
 */
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).populate('owner', 'nom prenom role');
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }
    if (!doc.isPublished) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Ce document n\'est pas publié',
          statusCode: 403,
        },
      });
    }
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/publications/:id/journal
 * Journal d'audit d'un document publié (admin ou owner uniquement).
 */
router.get('/:id/journal', async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }
    if (doc.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { message: 'Accès refusé au journal', statusCode: 403 },
      });
    }
    const journal = await Publication.find({ document: doc._id })
      .populate('performedBy', 'nom prenom email role')
      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: journal.length,
      data: journal,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;