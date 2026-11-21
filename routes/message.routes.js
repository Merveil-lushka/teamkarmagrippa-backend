const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { uploadChat } = require('../config/upload');
const { getMessages, sendMessage, sendFile, deleteMessage, getUnreadCount } = require('../controllers/message.controller');

router.use(protect);

router.get('/', getMessages);
router.get('/unread-count', getUnreadCount);
router.post('/', sendMessage);
router.post('/file', uploadChat.single('fichier'), sendFile);
router.delete('/:id', deleteMessage);

module.exports = router;
