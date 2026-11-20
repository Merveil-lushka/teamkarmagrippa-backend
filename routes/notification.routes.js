const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { listNotifications, markAllAsRead, getUnreadCommentCounts } = require('../controllers/notification.controller');

router.use(protect);

router.get('/', listNotifications);
router.put('/read', markAllAsRead);
router.get('/unread-comments', getUnreadCommentCounts);

module.exports = router;