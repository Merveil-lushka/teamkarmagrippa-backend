const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * Rôles métier (cf. cahier des charges §3)
 */
const ROLES = ['admin', 'secretaire', 'designer', 'dg', 'technicien'];

const userSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
      maxlength: [50, 'Le nom ne doit pas dépasser 50 caractères'],
    },
    prenom: {
      type: String,
      required: [true, 'Le prénom est requis'],
      trim: true,
      maxlength: [50, 'Le prénom ne doit pas dépasser 50 caractères'],
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Format email invalide'],
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est requis'],
      minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
      select: false, // jamais renvoyé par défaut dans les requêtes
    },
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: 'Rôle invalide : {VALUE}',
      },
      default: 'technicien',
    },
    actif: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        // Sécurité : ne jamais exposer le password ni __v
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Hook pre-save : hash automatique du password si modifié.
 * Mongoose 7+ : pas de `next`, on retourne une promesse (async/await).
 * Ne re-hash pas si le password n'a pas changé (ex: update profil).
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare un mot de passe candidat avec le hash stocké.
 * Usage : const ok = await user.comparePassword('plainPassword');
 * Nécessite d'avoir fait .select('+password') dans la requête.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Expose les rôles en statique : User.ROLES
 */
userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);