const Message = require('../models/Message');
const fs = require('fs');
const path = require('path');
const cloudinaryService = require('../services/cloudinary.service');

// Récupérer les 100 derniers messages
const getMessages = async (req, res, next) => {
  try {
    const messages = await Message.find()
      .populate('sender', 'nom prenom role agentCode')
      .sort({ createdAt: 1 }) // Du plus ancien au plus récent
      .limit(100);

    await Message.updateMany(
      { readBy: { $ne: req.user._id } },
      { $push: { readBy: req.user._id } }
    );

    return res.status(200).json({ success: true, data: messages });
  } catch (err) { return next(err); }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Message.countDocuments({
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    });
    return res.status(200).json({ success: true, count });
  } catch (err) { return next(err); }
};

// Envoyer un message texte
const sendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().isEmpty) {
      return res.status(400).json({ success: false, error: { message: 'Le message est vide', statusCode: 400 } });
    }
    const message = await Message.create({ sender: req.user._id, text: text.trim() });
    const populated = await message.populate('sender', 'nom prenom role agentCode');
    return res.status(201).json({ success: true, data: populated });
  } catch (err) { return next(err); }
};

// Envoyer un fichier dans le chat
const sendFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { message: 'Aucun fichier', statusCode: 400 } });

    const relativePath = path.relative(process.cwd(), req.file.path).split(path.sep).join('/');
    let fileUrl = '/uploads/' + relativePath.replace(/^uploads\//, '');

    // Upload Cloudinary
    if (cloudinaryService.isEnabled()) {
      const cloudResult = await cloudinaryService.uploadToCloud(req.file.path, { mimeType: req.file.mimetype, folder: `teamkarmagrippa/chat` });
      if (cloudResult.url) fileUrl = cloudResult.url;
    }

    const message = await Message.create({
      sender: req.user._id,
      text: req.body.text || '',
      fileUrl: fileUrl,
      fileType: req.file.mimetype,
      fileName: req.file.originalname,
    });

    const populated = await message.populate('sender', 'nom prenom role agentCode');
    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    return next(err);
  }
};

// Supprimer un message (Auteur ou Admin)
const deleteMessage = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, error: { message: 'Message introuvable', statusCode: 404 } });

    const isAuthor = message.sender.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Vous ne pouvez pas supprimer ce message', statusCode: 403 } });
    }

    await message.deleteOne();
    return res.status(200).json({ success: true, message: 'Message supprimé' });
  } catch (err) { return next(err); }
};

module.exports = { getMessages, sendMessage, sendFile, deleteMessage, getUnreadCount };