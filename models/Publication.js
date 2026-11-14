const mongoose = require('mongoose');

/**
 * Journal de publication : trace chaque action publier/dépublier
 * d'un document. Sert au journal d'activité (cahier des charges §7).
 *
 * Une ligne = une action de publication (et non l'état courant).
 * L'état courant est dans Document.isPublished.
 */
const publicationSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: {
        values: ['publish', 'unpublish'],
        message: 'Action invalide : {VALUE}',
      },
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'La note ne doit pas dépasser 500 caractères'],
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

// ── Index pour les requêtes de journal ──────────────────
publicationSchema.index({ createdAt: -1 });
publicationSchema.index({ document: 1, createdAt: -1 });
publicationSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Publication', publicationSchema);