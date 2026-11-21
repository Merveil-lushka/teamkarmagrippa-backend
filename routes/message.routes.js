const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const { getMessages, sendMessage, sendFile, deleteMessage } = require('../controllers/message.controller');

router.use(protect);

router.get('/', getMessages);
router.post('/', sendMessage);
router.post('/file', upload.single('fichier'), sendFile);
router.delete('/:id', deleteMessage);

module.exports = router;