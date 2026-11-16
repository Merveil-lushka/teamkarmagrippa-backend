const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Dossier = require('../models/Dossier');
const Publication = require('../models/Publication');
const Counter = require('../models/Counter');
const cloudinaryService = require('../services/cloudinary.service');

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
  fichier: doc.fichier,
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

// 👇 Fonction pour générer le numéro de série (TK0001)
const generateSerialNumber = async () => {
  const counter = await Counter.findByIdAndUpdate(
    'document_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `TK${counter.seq.toString().padStart(4, '0')}`;
};

const createDocument = async (req, res, next) => {
  try {
    if (!ROLES_CREATE.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { message: 'Non autorisé', statusCode: 403 } });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'Aucun fichier fourni', statusCode: 400 } });
    }

    const {
      type, nom, description, entrepriseCliente, nomChantier,
      dateDocument, dossierId,
      numeroDevis, montantDevisHT, montantDevisTTC, dateValiditeDevis,
      numeroFacture, montantFactureTTC, dateEcheanceFacture, statutPaiement,
    } = req.body;

    if (!type || !nom || !dateDocument) {
      return res.status(400).json({ success: false, error: { message: 'type, nom et dateDocument requis', statusCode: 400 } });
    }

    // Génération du numéro de série si c'est un devis ou une facture
    let numeroAuto = null;
    if (type === 'devis' || type === 'facture') {
      numeroAuto = await generateSerialNumber();
    }

    const metadata = {};
    if (type === 'devis') {
      metadata.numeroDevis = numeroDevis || numeroAuto;
      if (montantDevisHT) metadata.montantDevisHT = Number(montantDevisHT);
      if (montantDevisTTC) metadata.montantDevisTTC = Number(montantDevisTTC);
      if (dateValiditeDevis) metadata.dateValiditeDevis = new Date(dateValiditeDevis);
    } else if (type === 'facture') {
      metadata.numeroFacture = numeroFacture || numeroAuto;
      if (montantFactureTTC) metadata.montantFactureTTC = Number(montantFactureTTC);
      if (dateEcheanceFacture) metadata.dateEcheanceFacture = new Date(dateEcheanceFacture);
      if (statutPaiement) metadata.statutPaiement = statutPaiement;
    }

    const relativePath = path.relative(process.cwd(), req.file.path).split(path.sep).join('/');

    const doc = await Document.create({
      type, nom, description: description || '', entrepriseCliente: entrepriseCliente || '', nomChantier: nomChantier || '',
      dateDocument: new Date(dateDocument),
      fichier: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        urlLocale: '/uploads/' + relativePath.replace(/^uploads\//, ''),
        cheminLocal: req.file.path,
        cloudSyncStatus: cloudinaryService.isEnabled() ? 'pending' : 'disabled',
      },
      metadata, dossier: dossierId || null, owner: req.user._id,
    });

    if (cloudinaryService.isEnabled()) {
      const cloudResult = await cloudinaryService.uploadToCloud(req.file.path, { mimeType: req.file.mimetype, folder: `teamkarmagrippa/${req.user._id}` });
      doc.fichier.cloudSyncStatus = cloudResult.status;
      if (cloudResult.url) doc.fichier.urlCloud = cloudResult.url;
      if (cloudResult.publicId) doc.fichier.cloudPublicId = cloudResult.publicId;
      await doc.save();
    }

    return res.status(201).json({ success: true, data: documentResponse(doc) });
  } catch (err) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    return next(err);
  }
};

const listMyDocuments = async (req, res, next) => {
  try {
    if (req.user.role === 'technicien') {
      return res.status(403).json({ success: false, error: { message: 'Non autorisé', statusCode: 403 } });
    }
    const filter = {};
    if (!ROLES_GLOBAL_VIEW.includes(req.user.role)) filter.owner = req.user._id;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.mois) filter.mois = Number(req.query.mois);
    if (req.query.annee) filter.annee = Number(req.query.annee);
    if (req.query.dossier) filter.dossier = req.query.dossier;
    if (req.query.client) filter.entrepriseCliente = new RegExp(req.query.client, 'i');
    if (req.query.chantier) filter.nomChantier = new RegExp(req.query.chantier, 'i');
    if (req.query.published !== undefined) filter.isPublished = req.query.published === 'true';

    let projection = {}; let sort = { dateDocument: -1, createdAt: -1 };
    if (req.query.q) {
      filter.$text = { $search: req.query.q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const docs = await Document.find(filter, projection).sort(sort);
    return res.status(200).json({ success: true, count: docs.length, data: docs.map(documentResponse) });
  } catch (err) { return next(err); }
};

const getDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).populate('owner', 'nom prenom email role');
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Introuvable', statusCode: 404 } });
    if (!canView(req.user, doc)) return res.status(403).json({ success: false, error: { message: 'Accès refusé', statusCode: 403 } });
    return res.status(200).json({ success: true, data: documentResponse(doc) });
  } catch (err) { return next(err); }
};

// 👇 Modification complète avec possibilité de remplacer le fichier
const updateDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Introuvable', statusCode: 404 } });
    if (!canWrite(req.user, doc)) return res.status(403).json({ success: false, error: { message: 'Accès refusé', statusCode: 403 } });

    const { nom, description, entrepriseCliente, nomChantier, dateDocument } = req.body;
    if (nom !== undefined) doc.nom = nom;
    if (description !== undefined) doc.description = description;
    if (entrepriseCliente !== undefined) doc.entrepriseCliente = entrepriseCliente;
    if (nomChantier !== undefined) doc.nomChantier = nomChantier;
    if (dateDocument !== undefined) doc.dateDocument = new Date(dateDocument);

    // Gestion des metadata (devis/factures)
    if (req.body.metadata) {
      const metadataUpdates = typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata;
      doc.metadata = { ...doc.metadata.toObject(), ...metadataUpdates };
    }

    // 👇 Gestion du remplacement du fichier
    if (req.file) {
      // Suppression de l'ancien fichier
      if (doc.fichier?.cheminLocal && fs.existsSync(doc.fichier.cheminLocal)) {
        try { fs.unlinkSync(doc.fichier.cheminLocal); } catch (_) {}
      }
      if (doc.fichier?.cloudPublicId) {
        await cloudinaryService.deleteFromCloud(doc.fichier.cloudPublicId);
      }

      const relativePath = path.relative(process.cwd(), req.file.path).split(path.sep).join('/');
      doc.fichier = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        urlLocale: '/uploads/' + relativePath.replace(/^uploads\//, ''),
        cheminLocal: req.file.path,
        cloudSyncStatus: cloudinaryService.isEnabled() ? 'pending' : 'disabled',
      };

      if (cloudinaryService.isEnabled()) {
        const cloudResult = await cloudinaryService.uploadToCloud(req.file.path, { mimeType: req.file.mimetype, folder: `teamkarmagrippa/${req.user._id}` });
        doc.fichier.cloudSyncStatus = cloudResult.status;
        if (cloudResult.url) doc.fichier.urlCloud = cloudResult.url;
        if (cloudResult.publicId) doc.fichier.cloudPublicId = cloudResult.publicId;
      }
    }

    await doc.save();
    return res.status(200).json({ success: true, data: documentResponse(doc) });
  } catch (err) { return next(err); }
};

const togglePublish = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Introuvable', statusCode: 404 } });
    if (!canWrite(req.user, doc)) return res.status(403).json({ success: false, error: { message: 'Accès refusé', statusCode: 403 } });
    
    const { published, note } = req.body;
    if (published === doc.isPublished) return res.status(200).json({ success: true, message: 'Déjà à jour', data: documentResponse(doc) });

    doc.isPublished = published;
    doc.publishedAt = published ? new Date() : null;
    await doc.save();

    await Publication.create({ document: doc._id, action: published ? 'publish' : 'unpublish', performedBy: req.user._id, note: note || '' });
    return res.status(200).json({ success: true, message: published ? 'Publié' : 'Dépublié', data: documentResponse(doc) });
  } catch (err) { return next(err); }
};

const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Introuvable', statusCode: 404 } });
    if (!canWrite(req.user, doc)) return res.status(403).json({ success: false, error: { message: 'Accès refusé', statusCode: 403 } });

    if (doc.fichier?.cheminLocal && fs.existsSync(doc.fichier.cheminLocal)) { try { fs.unlinkSync(doc.fichier.cheminLocal); } catch (_) {} }
    if (doc.fichier?.cloudPublicId) { await cloudinaryService.deleteFromCloud(doc.fichier.cloudPublicId); }
    
    await doc.deleteOne();
    return res.status(200).json({ success: true, message: 'Supprimé', data: { id: req.params.id } });
  } catch (err) { return next(err); }
};

module.exports = { createDocument, listMyDocuments, getDocument, updateDocument, togglePublish, deleteDocument };