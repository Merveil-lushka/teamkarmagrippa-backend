/**
 * Script de bootstrap : crée le PREMIER compte admin.
 * Usage : npm run seed:admin
 *
 * Idempotent : si un admin existe déjà, ne fait rien.
 * Les identifiants peuvent être surchargés via les variables d'environnement
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NOM / SEED_ADMIN_PRENOM.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('🌱 SEED ADMIN — TeamKarmagrippa Cloud');
    console.log('═══════════════════════════════════════════════');

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ Connecté à ${mongoose.connection.host}`);
    console.log(`📦 Base : ${mongoose.connection.name}`);
    console.log('');

    // Vérification : un admin existe-t-il déjà ?
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Un admin existe déjà :');
      console.log(`   ▸ Email : ${existingAdmin.email}`);
      console.log(`   ▸ Nom   : ${existingAdmin.prenom} ${existingAdmin.nom}`);
      console.log('');
      console.log('👉 Aucune action effectuée (idempotent).');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Valeurs (surchargeables via .env)
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@teamkarmagrippa.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
    const nom = process.env.SEED_ADMIN_NOM || 'Admin';
    const prenom = process.env.SEED_ADMIN_PRENOM || 'Super';

    // Vérification de doublon email (au cas où un non-admin aurait déjà pris cet email)
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      console.error(`❌ L'email ${email} est déjà utilisé par un compte (rôle : ${existingEmail.role})`);
      console.error('   Change SEED_ADMIN_EMAIL dans .env ou supprime ce compte.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Création
    const admin = await User.create({
      nom,
      prenom,
      email,
      password,
      role: 'admin',
      createdBy: null, // bootstrap : personne n'a créé cet admin
    });

    console.log('🎉 Compte admin créé :');
    console.log(`   ▸ ID     : ${admin._id}`);
    console.log(`   ▸ Email  : ${admin.email}`);
    console.log(`   ▸ Nom    : ${admin.prenom} ${admin.nom}`);
    console.log(`   ▸ Rôle   : ${admin.role}`);
    console.log('');
    console.log('⚠️  IMPORTANT : note ce mot de passe, il est hashé en base.');
    console.log(`   Mot de passe actuel : ${password}`);
    console.log('   → Change-le dès le premier login (route à venir).');
    console.log('');
    console.log('👉 Tu peux maintenant tester :');
    console.log(`   curl -X POST http://localhost:5000/api/auth/login \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"email":"${email}","password":"${password}"}'`);
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur seed :', err.message);
    if (err.code === 11000) {
      console.error('   (email en doublon — un compte existe déjà avec cet email)');
    }
    process.exit(1);
  }
};

seedAdmin();