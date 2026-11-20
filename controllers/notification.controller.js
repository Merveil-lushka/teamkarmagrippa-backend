const Notification = require('../models/Notification');
const Comment = require('../models/Comment');

const listNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'nom prenom')
      .populate('document', 'nom')
      .sort({ createdAt: -1 })
      .limit(50);
    return res.status(200).json({ success: true, data: notifications });
  } catch (err) { return next(err); }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    return res.status(200).json({ success: true, message: 'Toutes les notifications sont lues' });
  } catch (err) { return next(err); }
};

// 👇 Récupérer le nombre de commentaires non lus pour chaque publication
const getUnreadCommentCounts = async (req, res, next) => {
  try {
    const unread = await Comment.aggregate([
      { $match: { readBy: { $ne: req.user._id } } },
      { $group: { _id: '$document', count: { $sum: 1 } } }
    ]);
    
    const counts = {};
    unread.forEach(item => { counts[item._id] = item.count; });
    
    return res.status(200).json({ success: true, data: counts });
  } catch (err) { return next(err); }
};

module.exports = { listNotifications, markAllAsRead, getUnreadCommentCounts };