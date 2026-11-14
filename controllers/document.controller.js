const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const Publication = require('../models/Publication');
const cloudinaryService = require('../services/cloudinary.service');

/**
 * ── RÈGLES MÉTIER ──────────────────────────────────────────
 * - Chaque utilisateur a SON espace isolé (owner forcé).
 * - Seul l'admin voit TOUS les documents.
 * - La publication est SÉPARÉE de la visibilité privée :
 *   publier un PDF le rend visible aux techniciens, sans
 *   exposer le dossier parent.
 * ───────────────────────────────────────────────────────────
 */

const ROLES_GLOBAL_VIEW = ['admin'];
const ROLES_CREATE = ['admin', 'secretaire', 'designer', 'dg'];
const ROLES_PUBLISH = ['admin', 'secretaire', 'designer', 'dg'];

const documentResponse = (doc) => ({
  id: doc._id,
  type: doc.type,
  nom: doc.nom,
  description: doc.description,
  entrepriseCliente: doc.entrepriseCliente,
  nomChantier: doc.nomChantier,
  dateDocument: doc.dateDocument,
  mois: doc.mois,
  annee: doc.annee,
  fichier: {
    originalName: doc.fichier?.originalName,
    mimeType: doc.fichier?.mimeType,
    size: doc.fichier?.size,
    urlLocale: doc.fichier?.urlLocale,
    urlCloud: doc.fichier?.urlCloud,
    cloudSyncStatus: doc.fichier?.cloudSyncStatus,
  },
  metadata: doc.metadata,
  dossier: doc.dossier,
  owner: doc.owner,
  isPublished: doc.isPublished,
  publishedAt: doc.publishedAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const canView = (user, doc) => {
  if (user.role === 'admin') return true;
  if (user.role === 'technicien') return doc.isPublished === true;
  return doc.owner.toString() === user._id.toString();
};

const canWrite = (user, doc) => {
  if (user.role === 'admin') return true;
  if (user.role === 'technicien') return false;
  return doc.owner.toString() === user._id.toString();
};

/**
 * POST /api/documents
 * Upload d'un fichier + métadonnées.
 * Multipart/form-data : champ "fichier" (obligatoire) + champs texte.
 * Le `owner` est forcé à req.user._id.
 * @access Admin, Secrétaire, Designer, DG
 * Middleware : protect + upload.single('fichier')
 */
const createDocument = async (req, res, next) => {
  try {
    if (!ROLES_CREATE.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Le rôle "${req.user.role}" ne peut pas uploader de document`,
          statusCode: 403,
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Aucun fichier fourni (champ attendu : "fichier")',
          statusCode: 400,
        },
      });
    }

    const {
      type, nom, description, entrepriseCliente, nomChantier,
      dateDocument, dossierId,
      numeroDevis, montantDevisHT, montantDevisTTC, dateValiditeDevis,
      numeroFacture, montantFactureTTC, dateEcheanceFacture, statutPaiement,
    } = req.body;

    if (!type || !nom || !dateDocument) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'type, nom et dateDocument sont requis',
          statusCode: 400,
        },
      });
    }

    if (!Document.TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Type invalide. Valeurs : ${Document.TYPES.join(', ')}`,
          statusCode: 400,
        },
      });
    }

    // Vérif dossier : si fourni, il doit exister ET appartenir à l'utilisateur
    if (dossierId) {
      const dossier = await Dossier.findById(dossierId);
      if (!dossier) {
        return res.status(404).json({
          success: false,
          error: { message: 'Dossier introuvable', statusCode: 404 },
        });
      }
      if (dossier.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Ce dossier appartient à un autre espace de travail',
            statusCode: 403,
          },
        });
      }
    }

    // Construire les metadata selon le type
    const metadata = {};
    if (type === 'devis') {
      if (numeroDevis) metadata.numeroDevis = numeroDevis;
      if (montantDevisHT) metadata.montantDevisHT = Number(montantDevisHT);
      if (montantDevisTTC) metadata.montantDevisTTC = Number(montantDevisTTC);
      if (dateValiditeDevis) metadata.dateValiditeDevis = new Date(dateValiditeDevis);
    } else if (type === 'facture') {
      if (numeroFacture) metadata.numeroFacture = numeroFacture;
      if (montantFactureTTC) metadata.montantFactureTTC = Number(montantFactureTTC);
      if (dateEcheanceFacture) metadata.dateEcheanceFacture = new Date(dateEcheanceFacture);
      if (statutPaiement) metadata.statutPaiement = statutPaiement;
    }

    // Chemin relatif stocké dans Document.urlLocale (servi plus tard via /uploads)
    const relativePath = path.relative(process.cwd(), req.file.path).split(path.sep).join('/');

    const doc = await Document.create({
      type,
      nom,
      description: description || '',
      entrepriseCliente: entrepriseCliente || '',
      nomChantier: nomChantier || '',
      dateDocument: new Date(dateDocument),
      fichier: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        urlLocale: '/uploads/' + relativePath.replace(/^uploads\//, ''),
        cheminLocal: req.file.path,
        cloudSyncStatus: cloudinaryService.isEnabled() ? 'pending' : 'disabled',
      },
      metadata,
      dossier: dossierId || null,
      owner: req.user._id,
    });

    // Double écriture cloud (async mais on attend pour avoir le statut final)
    if (cloudinaryService.isEnabled()) {
      const cloudResult = await cloudinaryService.uploadToCloud(req.file.path, {
        mimeType: req.file.mimetype,
        folder: `teamkarmagrippa/${req.user._id}`,
      });
      doc.fichier.cloudSyncStatus = cloudResult.status;
      if (cloudResult.url) doc.fichier.urlCloud = cloudResult.url;
      if (cloudResult.publicId) doc.fichier.cloudPublicId = cloudResult.publicId;
      await doc.save();
    }

    return res.status(201).json({
      success: true,
      data: documentResponse(doc),
    });
  } catch (err) {
    // Si un fichier a été uploadé mais l'erreur arrive après, on nettoie
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    }
    return next(err);
  }
};

/**
 * GET /api/documents/me
 * Liste les documents de l'utilisateur connecté, avec recherche.
 * Filtres : ?type=&mois=&annee=&client=&chantier=&q=&dossier=&published=
 * @access Admin, Secrétaire, Designer, DG
 */
const listMyDocuments = async (req, res, next) => {
  try {
    if (req.user.role === 'technicien') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Les techniciens ne peuvent pas lister de documents privés (utilisez /api/publications)',
          statusCode: 403,
        },
      });
    }

    const filter = {};

    // Isolation stricte : sauf admin, chacun voit uniquement ses documents
    if (!ROLES_GLOBAL_VIEW.includes(req.user.role)) {
      filter.owner = req.user._id;
    }

    // Filtres
    if (req.query.type) filter.type = req.query.type;
    if (req.query.mois) filter.mois = Number(req.query.mois);
    if (req.query.annee) filter.annee = Number(req.query.annee);
    if (req.query.dossier) filter.dossier = req.query.dossier;
    if (req.query.client) filter.entrepriseCliente = new RegExp(req.query.client, 'i');
    if (req.query.chantier) filter.nomChantier = new RegExp(req.query.chantier, 'i');
    if (req.query.published !== undefined) filter.isPublished = req.query.published === 'true';

    let projection = {};
    let sort = { dateDocument: -1, createdAt: -1 };
    if (req.query.q) {
      filter.$text = { $search: req.query.q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const docs = await Document.find(filter, projection).sort(sort);

    return res.status(200).json({
      success: true,
      count: docs.length,
      scope: ROLES_GLOBAL_VIEW.includes(req.user.role) ? 'all' : 'mine',
      data: docs.map(documentResponse),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/documents/:id
 * Détail d'un document.
 * @access Admin (tout) | Owner (les siens) | Technicien (si publié)
 */
const getDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).populate('owner', 'nom prenom email role');
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }

    if (!canView(req.user, doc)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé à ce document',
          statusCode: 403,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: documentResponse(doc),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/documents/:id
 * Met à jour les métadonnées (pas le fichier binaire).
 * @access Admin (tout) | Owner (les siens)
 */
const updateDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }

    if (!canWrite(req.user, doc)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce document appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    const allowed = ['nom', 'description', 'entrepriseCliente', 'nomChantier', 'dateDocument', 'metadata'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'dateDocument') {
          doc.dateDocument = new Date(req.body[key]);
        } else if (key === 'metadata') {
          doc.metadata = { ...doc.metadata.toObject(), ...req.body.metadata };
        } else {
          doc[key] = req.body[key];
        }
      }
    }

    await doc.save();

    return res.status(200).json({
      success: true,
      data: documentResponse(doc),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/documents/:id/publish
 * Publie ou dépublie un document (le rend visible aux techniciens).
 * Body : { published: true|false, note?: string }
 * @access Admin | Owner
 */
const togglePublish = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }

    if (!canWrite(req.user, doc)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce document appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    if (!ROLES_PUBLISH.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Le rôle "${req.user.role}" ne peut pas publier`,
          statusCode: 403,
        },
      });
    }

    const { published, note } = req.body;
    if (typeof published !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Le champ "published" (boolean) est requis',
          statusCode: 400,
        },
      });
    }

    if (published === doc.isPublished) {
      return res.status(200).json({
        success: true,
        message: `Document déjà ${published ? 'publié' : 'non publié'}`,
        data: documentResponse(doc),
      });
    }

    // Mise à jour de l'état
    doc.isPublished = published;
    doc.publishedAt = published ? new Date() : null;
    await doc.save();

    // Journal d'audit
    await Publication.create({
      document: doc._id,
      action: published ? 'publish' : 'unpublish',
      performedBy: req.user._id,
      note: note || '',
    });

    return res.status(200).json({
      success: true,
      message: published ? 'Document publié' : 'Document dépublié',
      data: documentResponse(doc),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/documents/:id
 * Supprime un document (MongoDB + fichier local + Cloudinary).
 * @access Admin | Owner
 */
const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document introuvable', statusCode: 404 },
      });
    }

    if (!canWrite(req.user, doc)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce document appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    // 1. Suppression du fichier local
    if (doc.fichier?.cheminLocal && fs.existsSync(doc.fichier.cheminLocal)) {
      try { fs.unlinkSync(doc.fichier.cheminLocal); } catch (_) { /* ignore */ }
    }

    // 2. Suppression du fichier Cloudinary
    if (doc.fichier?.cloudPublicId) {
      await cloudinaryService.deleteFromCloud(doc.fichier.cloudPublicId);
    }

    // 3. Suppression MongoDB
    await doc.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Document supprimé (local + cloud)',
      data: { id: req.params.id },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createDocument,
  listMyDocuments,
  getDocument,
  updateDocument,
  togglePublish,
  deleteDocument,
};