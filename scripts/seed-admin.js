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
      console.log(`   ▸ Code Agent : ${existingAdmin.agentCode}`);
      console.log(`   ▸ Nom        : ${existingAdmin.prenom} ${existingAdmin.nom}`);
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
    const agentCode = 'TK20260000'; // 👈 Code Agent par défaut pour le premier Admin

    // Vérification de doublon email (au cas où)
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      console.error(`❌ L'email ${email} est déjà utilisé par un compte (rôle : ${existingEmail.role})`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Création
    const admin = await User.create({
      nom,
      prenom,
      email,
      agentCode, // 👈 Ajout du Code Agent
      password,
      role: 'admin',
      canPublish: true, // L'admin peut toujours publier
      createdBy: null,
    });

    console.log('🎉 Compte admin créé :');
    console.log(`   ▸ ID         : ${admin._id}`);
    console.log(`   ▸ Code Agent : ${admin.agentCode}`);
    console.log(`   ▸ Nom        : ${admin.prenom} ${admin.nom}`);
    console.log(`   ▸ Rôle       : ${admin.role}`);
    console.log('');
    console.log('⚠️  IMPORTANT : note ce mot de passe, il est hashé en base.');
    console.log(`   Mot de passe actuel : ${password}`);
    console.log('   → Change-le dès le premier login.');
    console.log('');
    console.log('👉 Tu peux maintenant tester :');
    console.log(`   curl -X POST http://localhost:5000/api/auth/login \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"agentCode":"${agentCode}","password":"${password}"}'`);
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur seed :', err.message);
    if (err.code === 11000) {
      console.error('   (email ou code agent en doublon)');
    }
    process.exit(1);
  }
};

seedAdmin();