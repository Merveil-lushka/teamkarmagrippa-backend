const mongoose = require('mongoose');

/**
 * Connexion à MongoDB via Mongoose.
 * Utilise la variable d'environnement MONGODB_URI.
 */
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI non défini dans .env');
    }

    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
    console.log(`📦 Base de données   : ${conn.connection.name}`);

    // Logs de diagnostic en développement
    if (process.env.NODE_ENV === 'development') {
      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB déconnecté');
      });
      mongoose.connection.on('error', (err) => {
        console.error('❌ Erreur MongoDB :', err.message);
      });
    }

    return conn;
  } catch (err) {
    console.error('❌ Échec connexion MongoDB :', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;