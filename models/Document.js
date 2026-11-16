const mongoose = require('mongoose');

/**
 * Types de documents (cf. cahier des charges + besoin recherche)
 */
const TYPES = [
  'devis',
  'facture',
  'pdf',
  'photo',
  'video',
  'audio',
  'archive',   // 👈 Nouveau
  'document',  // 👈 Nouveau
  'autre'
];

/**
 * Sous-types MIME acceptés (validation à l'upload)
 * Note : 'application/octet-stream' est ajouté pour compenser
 * le comportement des navigateurs Web qui envoient un type générique.
 */
const MIME_MAP = {
  devis: ['application/pdf', 'application/octet-stream'],
  facture: ['application/pdf', 'application/octet-stream'],
  pdf: ['application/pdf', 'application/octet-stream'],
  
  photo: [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 
    'application/octet-stream'
  ],
  
  video: [
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 
    'application/octet-stream'
  ],
  
  audio: [
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 
    'application/octet-stream'
  ],
  
  archive: [
    'application/zip', 
    'application/x-zip-compressed', 
    'application/x-rar-compressed', 
    'application/x-7z-compressed', 
    'application/octet-stream'
  ],
  
  document: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'text/plain',
    'application/octet-stream'
  ],
  
  autre: ['*/*'],
};

const documentSchema = new mongoose.Schema(
  {
    // ── Identification métier ──────────────────────────────
    type: {
      type: String,
      enum: { values: TYPES, message: 'Type invalide : {VALUE}' },
      required: [true, 'Le type est requis'],
      index: true,
    },
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
      maxlength: [200, 'Le nom ne doit pas dépasser 200 caractères'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'La description ne doit pas dépasser 1000 caractères'],
    },

    // ── Métadonnées métier (recherche) ─────────────────────
    entrepriseCliente: {
      type: String,
      trim: true,
      default: '',
      index: true,
      maxlength: [150, 'L\'entreprise ne doit pas dépasser 150 caractères'],
    },
    nomChantier: {
      type: String,
      trim: true,
      default: '',
      index: true,
      maxlength: [150, 'Le nom du chantier ne doit pas dépasser 150 caractères'],
    },
    dateDocument: {
      type: Date,
      required: [true, 'La date du document est requise'],
      index: true,
    },
    // Calculés automatiquement par le hook pre-validate
    mois: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },
    annee: {
      type: Number,
      min: 1900,
      max: 2200,
      index: true,
    },

    // ── Fichier physique (double stockage) ─────────────────
    fichier: {
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true, min: 0 },

      // Local (backup immédiat)
      urlLocale: { type: String, required: true },
      cheminLocal: { type: String, required: true }, // chemin absolu sur disque

      // Cloud (conservation long terme)
      urlCloud: { type: String, default: null },
      cloudPublicId: { type: String, default: null },
      cloudSyncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed', 'disabled'],
        default: 'pending',
        index: true,
      },
    },

    // ── Métadonnées spécifiques au type (optionnel) ────────
    metadata: {
      // Devis
      numeroDevis: { type: String, default: null },
      montantDevisHT: { type: Number, default: null },
      montantDevisTTC: { type: Number, default: null },
      dateValiditeDevis: { type: Date, default: null },

      // Facture
      numeroFacture: { type: String, default: null },
      montantFactureTTC: { type: Number, default: null },
      dateEcheanceFacture: { type: Date, default: null },
      statutPaiement: {
        type: String,
        enum: ['payee', 'en_attente', 'en_retard', null],
        default: null,
      },

      // Média
      largeur: { type: Number, default: null },
      hauteur: { type: Number, default: null },
      dureeSecondes: { type: Number, default: null },
    },

    // ── Relations ──────────────────────────────────────────
    dossier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dossier',
      default: null,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Publication (visibilité techniciens) ───────────────
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Hook pre-validate : calcule mois/annee depuis dateDocument
 * (une seule source de vérité, jamais désynchronisé).
 */
documentSchema.pre('validate', function () {
  if (this.dateDocument) {
    const d = new Date(this.dateDocument);
    if (!isNaN(d.getTime())) {
      this.mois = d.getMonth() + 1; // 1-12
      this.annee = d.getFullYear();
    }
  }
});

/**
 * Hook pre-save : valide que le mimeType correspond au type déclaré.
 * (les fichiers 'autre' acceptent tout)
 */
documentSchema.pre('validate', function () {
  if (!this.fichier || !this.fichier.mimeType || !this.type) return;
  const allowed = MIME_MAP[this.type] || [];
  if (allowed.includes('*/*')) return;
  if (!allowed.includes(this.fichier.mimeType)) {
    this.invalidate(
      'fichier.mimeType',
      `Le type "${this.type}" n'accepte pas le MIME "${this.fichier.mimeType}"`
    );
  }
});

// ── Index composés pour la recherche ─────────────────────
// (owner + filtres fréquents)
documentSchema.index({ owner: 1, isPublished: 1, createdAt: -1 });
documentSchema.index({ type: 1, mois: 1, annee: 1 });
documentSchema.index({ isPublished: 1, publishedAt: -1 });

// Index textuel (recherche q=...)
documentSchema.index({
  nom: 'text',
  description: 'text',
  entrepriseCliente: 'text',
  nomChantier: 'text',
});

// ── Statics ────────────────────────────────────────────
documentSchema.statics.TYPES = TYPES;
documentSchema.statics.MIME_MAP = MIME_MAP;

module.exports = mongoose.model('Document', documentSchema);