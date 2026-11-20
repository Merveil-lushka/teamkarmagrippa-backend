const Dossier = require('../models/Dossier');
const Document = require('../models/Document');

const ROLES_GLOBAL_VIEW = ['admin'];
// 👇 Ajout de 'technicien' ici
const ROLES_CREATE = ['admin', 'secretaire', 'designer', 'dg', 'technicien'];
const ROLES_GLOBAL_WRITE = ['admin'];

const dossierResponse = (dossier) => ({
  id: dossier._id,
  nom: dossier.nom,
  client: dossier.client,
  adresseChantier: dossier.adresseChantier,
  description: dossier.description,
  statut: dossier.statut,
  owner: dossier.owner,
  createdAt: dossier.createdAt,
  updatedAt: dossier.updatedAt,
});

const canView = (user, dossier) => {
  if (user.role === 'admin') return true;
  // Un technicien peut voir ses propres dossiers
  if (user.role === 'technicien') return dossier.owner.toString() === user._id.toString();
  return dossier.owner.toString() === user._id.toString();
};

const canWrite = (user, dossier) => {
  if (user.role === 'admin') return true;
  return dossier.owner.toString() === user._id.toString();
};

const createDossier = async (req, res, next) => {
  try {
    if (!ROLES_CREATE.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { message: `Le rôle "${req.user.role}" ne peut pas créer de dossier`, statusCode: 403 } });
    }

    const { nom, client, adresseChantier, description } = req.body;
    if (!nom || !client) {
      return res.status(400).json({ success: false, error: { message: 'nom et client sont requis', statusCode: 400 } });
    }

    const dossier = await Dossier.create({
      nom, client,
      adresseChantier: adresseChantier || '',
      description: description || '',
      owner: req.user._id,
    });

    return res.status(201).json({ success: true, data: dossierResponse(dossier) });
  } catch (err) {
    return next(err);
  }
};

const listDossiers = async (req, res, next) => {
  try {
    // 👇 On retire le blocage qui interdisait l'accès aux techniciens
    const filter = {};
    if (!ROLES_GLOBAL_VIEW.includes(req.user.role)) {
      filter.owner = req.user._id;
    }

    if (req.query.statut) filter.statut = req.query.statut;
    if (req.query.client) filter.client = new RegExp(req.query.client, 'i');

    let projection = {};
    let sort = { createdAt: -1 };
    if (req.query.q) {
      filter.$text = { $search: req.query.q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const dossiers = await Dossier.find(filter, projection).sort(sort);

    return res.status(200).json({
      success: true,
      count: dossiers.length,
      scope: ROLES_GLOBAL_VIEW.includes(req.user.role) ? 'all' : 'mine',
      data: dossiers.map(dossierResponse),
    });
  } catch (err) {
    return next(err);
  }
};

const getDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ success: false, error: { message: 'Dossier introuvable', statusCode: 404 } });

    if (!canView(req.user, dossier)) {
      return res.status(403).json({ success: false, error: { message: 'Accès refusé à ce dossier', statusCode: 403 } });
    }

    const documents = await Document.find({ dossier: dossier._id })
      .select('type nom entrepriseCliente nomChantier dateDocument mois annee isPublished fichier createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        ...dossierResponse(dossier),
        documents: documents.map((d) => ({
          id: d._id, type: d.type, nom: d.nom,
          entrepriseCliente: d.entrepriseCliente,
          nomChantier: d.nomChantier,
          dateDocument: d.dateDocument, mois: d.mois, annee: d.annee,
          isPublished: d.isPublished,
          fichier: d.fichier, // 👈 L'objet complet
          createdAt: d.createdAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

const updateDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ success: false, error: { message: 'Dossier introuvable', statusCode: 404 } });

    if (!canWrite(req.user, dossier)) {
      return res.status(403).json({ success: false, error: { message: 'Accès refusé à ce dossier', statusCode: 403 } });
    }

    const { nom, client, adresseChantier, description, statut } = req.body;
    if (nom !== undefined) dossier.nom = nom;
    if (client !== undefined) dossier.client = client;
    if (adresseChantier !== undefined) dossier.adresseChantier = adresseChantier;
    if (description !== undefined) dossier.description = description;
    if (statut !== undefined) {
      if (!Dossier.STATUTS.includes(statut)) return res.status(400).json({ success: false, error: { message: `Statut invalide`, statusCode: 400 } });
      dossier.statut = statut;
    }

    await dossier.save();
    return res.status(200).json({ success: true, data: dossierResponse(dossier) });
  } catch (err) {
    return next(err);
  }
};

const deleteDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) return res.status(404).json({ success: false, error: { message: 'Dossier introuvable', statusCode: 404 } });

    if (!canWrite(req.user, dossier)) {
      return res.status(403).json({ success: false, error: { message: 'Accès refusé à ce dossier', statusCode: 403 } });
    }

    const docCount = await Document.countDocuments({ dossier: dossier._id });
    await Document.deleteMany({ dossier: dossier._id });
    await dossier.deleteOne();

    return res.status(200).json({ success: true, message: `Dossier supprimé (${docCount} fichier(s))`, data: { id: req.params.id } });
  } catch (err) {
    return next(err);
  }
};

module.exports = { createDossier, listDossiers, getDossier, updateDossier, deleteDossier };