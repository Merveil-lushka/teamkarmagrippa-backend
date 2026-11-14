const mongoose = require('mongoose');

/**
 * Statuts possibles d'un dossier (cf. cahier des charges §4.1)
 */
const STATUTS = ['en_cours', 'termine', 'archive'];

const dossierSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom du dossier est requis'],
      trim: true,
      maxlength: [120, 'Le nom ne doit pas dépasser 120 caractères'],
    },
    client: {
      type: String,
      required: [true, 'Le nom du client est requis'],
      trim: true,
      maxlength: [120, 'Le nom du client ne doit pas dépasser 120 caractères'],
    },
    adresseChantier: {
      type: String,
      trim: true,
      default: '',
      maxlength: [250, 'L\'adresse ne doit pas dépasser 250 caractères'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'La description ne doit pas dépasser 1000 caractères'],
    },
    statut: {
      type: String,
      enum: {
        values: STATUTS,
        message: 'Statut invalide : {VALUE}',
      },
      default: 'en_cours',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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

// ── Index pour la recherche (cf. besoin : recherche par nom, client, mois) ──
dossierSchema.index({ owner: 1, createdAt: -1 });
dossierSchema.index({ client: 1 });
dossierSchema.index({ statut: 1 });
dossierSchema.index({
  nom: 'text',
  client: 'text',
  adresseChantier: 'text',
  description: 'text',
});

/**
 * Expose les statuts en statique : Dossier.STATUTS
 */
dossierSchema.statics.STATUTS = STATUTS;

module.exports = mongoose.model('Dossier', dossierSchema);