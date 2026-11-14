const Dossier = require('../models/Dossier');
const Document = require('../models/Document');

/**
 * ── RÈGLES MÉTIER ──────────────────────────────────────────
 * Chaque utilisateur (secrétaire, designer, DG) a SON espace
 * de travail isolé. Personne ne voit les dossiers d'un autre.
 * Seul l'admin voit TOUS les espaces (supervision).
 * Les techniciens n'ont accès à AUCUN dossier.
 * ───────────────────────────────────────────────────────────
 */

/**
 * Seul l'admin voit tous les dossiers (supervision).
 * Tous les autres rôles ne voient que leurs propres dossiers.
 */
const ROLES_GLOBAL_VIEW = ['admin'];

/**
 * Rôles autorisés à créer un dossier (chacun dans son espace).
 */
const ROLES_CREATE = ['admin', 'secretaire', 'designer', 'dg'];

/**
 * Seul l'admin peut modifier/supprimer N'IMPORTE QUEL dossier.
 * Les autres rôles ne peuvent modifier/supprimer que les leurs.
 */
const ROLES_GLOBAL_WRITE = ['admin'];

/**
 * Helper : formatte la réponse dossier.
 */
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

/**
 * Helper : un user peut-il voir un dossier donné ?
 *   - Admin : oui (toujours)
 *   - Autres rôles : uniquement si owner
 *   - Technicien : jamais
 */
const canView = (user, dossier) => {
  if (user.role === 'admin') return true;
  if (user.role === 'technicien') return false;
  return dossier.owner.toString() === user._id.toString();
};

/**
 * Helper : un user peut-il modifier/supprimer un dossier ?
 *   - Admin : oui (toujours)
 *   - Secrétaire/Designer/DG : uniquement si owner
 *   - Technicien : jamais
 */
const canWrite = (user, dossier) => {
  if (user.role === 'admin') return true;
  if (user.role === 'technicien') return false;
  return dossier.owner.toString() === user._id.toString();
};

/**
 * POST /api/dossiers
 * Crée un dossier dans l'espace personnel de l'utilisateur.
 * Le `owner` est TOUJOURS l'utilisateur connecté (impossible de créer
 * un dossier au nom d'un autre, même en trichant sur le body).
 * @access Admin, Secrétaire, Designer, DG
 */
const createDossier = async (req, res, next) => {
  try {
    if (!ROLES_CREATE.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Le rôle "${req.user.role}" ne peut pas créer de dossier`,
          statusCode: 403,
        },
      });
    }

    const { nom, client, adresseChantier, description } = req.body;

    if (!nom || !client) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'nom et client sont requis',
          statusCode: 400,
        },
      });
    }

    const dossier = await Dossier.create({
      nom,
      client,
      adresseChantier: adresseChantier || '',
      description: description || '',
      owner: req.user._id, // ⚠️ forcé, jamais depuis le body
    });

    return res.status(201).json({
      success: true,
      data: dossierResponse(dossier),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/dossiers
 * Liste les dossiers visibles par l'utilisateur connecté :
 *   - Admin : tous les dossiers
 *   - Secrétaire/Designer/DG : uniquement SES dossiers
 *   - Technicien : 403 (aucun accès)
 * Filtres : ?statut=en_cours&client=Dupont&q=recherche
 * @access Admin, Secrétaire, Designer, DG
 */
const listDossiers = async (req, res, next) => {
  try {
    // Technicien : aucun accès
    if (req.user.role === 'technicien') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Les techniciens n\'ont pas accès aux dossiers',
          statusCode: 403,
        },
      });
    }

    const filter = {};

    // Isolation stricte : sauf admin, chacun voit uniquement ses dossiers
    if (!ROLES_GLOBAL_VIEW.includes(req.user.role)) {
      filter.owner = req.user._id;
    }

    // Filtres optionnels
    if (req.query.statut) filter.statut = req.query.statut;
    if (req.query.client) filter.client = new RegExp(req.query.client, 'i');

    // Recherche full-text via $text
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

/**
 * GET /api/dossiers/:id
 * Détail d'un dossier + liste de ses documents.
 * @access Admin (tout) | Secrétaire/Designer/DG (si owner)
 */
const getDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res.status(404).json({
        success: false,
        error: { message: 'Dossier introuvable', statusCode: 404 },
      });
    }

    if (!canView(req.user, dossier)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce dossier appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    // Liste des documents rattachés (sans le binaire)
    const documents = await Document.find({ dossier: dossier._id })
      .select('type nom entrepriseCliente nomChantier dateDocument mois annee isPublished fichier.size fichier.mimeType createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        ...dossierResponse(dossier),
        documents: documents.map((d) => ({
          id: d._id,
          type: d.type,
          nom: d.nom,
          entrepriseCliente: d.entrepriseCliente,
          nomChantier: d.nomChantier,
          dateDocument: d.dateDocument,
          mois: d.mois,
          annee: d.annee,
          isPublished: d.isPublished,
          taille: d.fichier?.size,
          mimeType: d.fichier?.mimeType,
          createdAt: d.createdAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/dossiers/:id
 * Modifie un dossier (nom, client, adresse, description, statut).
 * @access Admin (tout) | Secrétaire/Designer/DG (si owner)
 */
const updateDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res.status(404).json({
        success: false,
        error: { message: 'Dossier introuvable', statusCode: 404 },
      });
    }

    if (!canWrite(req.user, dossier)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce dossier appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    const { nom, client, adresseChantier, description, statut } = req.body;

    if (nom !== undefined) dossier.nom = nom;
    if (client !== undefined) dossier.client = client;
    if (adresseChantier !== undefined) dossier.adresseChantier = adresseChantier;
    if (description !== undefined) dossier.description = description;
    if (statut !== undefined) {
      if (!Dossier.STATUTS.includes(statut)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Statut invalide. Valeurs : ${Dossier.STATUTS.join(', ')}`,
            statusCode: 400,
          },
        });
      }
      dossier.statut = statut;
    }

    await dossier.save();

    return res.status(200).json({
      success: true,
      data: dossierResponse(dossier),
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/dossiers/:id
 * Supprime un dossier + ses documents.
 * @access Admin (tout) | Secrétaire/Designer/DG (si owner)
 */
const deleteDossier = async (req, res, next) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res.status(404).json({
        success: false,
        error: { message: 'Dossier introuvable', statusCode: 404 },
      });
    }

    if (!canWrite(req.user, dossier)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Accès refusé : ce dossier appartient à un autre espace de travail',
          statusCode: 403,
        },
      });
    }

    // Compter les documents avant suppression
    const docCount = await Document.countDocuments({ dossier: dossier._id });

    // Suppression en cascade des documents MongoDB
    // (les fichiers physiques local + cloud restent pour V1 — nettoyage cron plus tard)
    await Document.deleteMany({ dossier: dossier._id });
    await dossier.deleteOne();

    return res.status(200).json({
      success: true,
      message: `Dossier supprimé (${docCount} document(s) rattaché(s) également supprimé(s))`,
      data: { id: req.params.id, documentsSupprimes: docCount },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createDossier,
  listDossiers,
  getDossier,
  updateDossier,
  deleteDossier,
};