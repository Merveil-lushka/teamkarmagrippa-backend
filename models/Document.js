const mongoose = require('mongoose');

const TYPES = [
  'devis', 'facture', 'pdf', 'photo', 'video', 'audio', 'archive', 'document', 'autre'
];

const MIME_MAP = {
  devis: ['application/pdf', 'application/octet-stream'],
  facture: ['application/pdf', 'application/octet-stream'],
  pdf: ['application/pdf', 'application/octet-stream'],
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/octet-stream'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'application/octet-stream'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'application/octet-stream'],
  archive: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/octet-stream'],
  document: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/octet-stream'
  ],
  autre: ['*/*'],
};

const documentSchema = new mongoose.Schema(
  {
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
    
    // 👇 NOUVEAUX CHAMPS AJOUTÉS ICI
    adresseChantier: {
      type: String,
      trim: true,
      default: '',
      maxlength: [250, 'L\'adresse ne doit pas dépasser 250 caractères'],
    },
    devise: {
      type: String,
      default: 'USD',
    },
    // 👆 FIN DES NOUVEAUX CHAMPS

    dateDocument: {
      type: Date,
      required: [true, 'La date du document est requise'],
      index: true,
    },
    mois: { type: Number, min: 1, max: 12, index: true },
    annee: { type: Number, min: 1900, max: 2200, index: true },

    fichier: {
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true, min: 0 },
      urlLocale: { type: String, required: true },
      cheminLocal: { type: String, required: true },
      urlCloud: { type: String, default: null },
      cloudPublicId: { type: String, default: null },
      cloudSyncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed', 'disabled'],
        default: 'pending',
        index: true,
      },
    },

    metadata: {
      numeroDevis: { type: String, default: null },
      montantDevisHT: { type: Number, default: null },
      montantDevisTTC: { type: Number, default: null },
      dateValiditeDevis: { type: Date, default: null },
      numeroFacture: { type: String, default: null },
      montantFactureTTC: { type: Number, default: null },
      dateEcheanceFacture: { type: Date, default: null },
      statutPaiement: { type: String, enum: ['payee', 'en_attente', 'en_retard', null], default: null },
      largeur: { type: Number, default: null },
      hauteur: { type: Number, default: null },
      dureeSecondes: { type: Number, default: null },
    },

    dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
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

documentSchema.pre('validate', function () {
  if (this.dateDocument) {
    const d = new Date(this.dateDocument);
    if (!isNaN(d.getTime())) {
      this.mois = d.getMonth() + 1;
      this.annee = d.getFullYear();
    }
  }
});

documentSchema.pre('validate', function () {
  if (!this.fichier || !this.fichier.mimeType || !this.type) return;
  const allowed = MIME_MAP[this.type] || [];
  if (allowed.includes('*/*')) return;
  if (!allowed.includes(this.fichier.mimeType)) {
    this.invalidate('fichier.mimeType', `Le type "${this.type}" n'accepte pas le MIME "${this.fichier.mimeType}"`);
  }
});

documentSchema.index({ owner: 1, isPublished: 1, createdAt: -1 });
documentSchema.index({ type: 1, mois: 1, annee: 1 });
documentSchema.index({ isPublished: 1, publishedAt: -1 });
documentSchema.index({ nom: 'text', description: 'text', entrepriseCliente: 'text', nomChantier: 'text' });

documentSchema.statics.TYPES = TYPES;
documentSchema.statics.MIME_MAP = MIME_MAP;

module.exports = mongoose.model('Document', documentSchema);