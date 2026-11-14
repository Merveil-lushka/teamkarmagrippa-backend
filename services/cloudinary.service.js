const fs = require('fs');
const path = require('path');

/**
 * Service Cloudinary : upload/suppression sur le cloud.
 * Mode "graceful degradation" : si Cloudinary est désactivé ou échoue,
 * le fichier local reste disponible et le statut est marqué en conséquence.
 */

let cloudinary = null;

const isEnabled = () => {
  return (
    process.env.STORAGE_CLOUD_PROVIDER === 'cloudinary' &&
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET
  );
};

const initCloudinary = () => {
  if (!isEnabled()) {
    console.log('ℹ️  Cloudinary désactivé (STORAGE_CLOUD_PROVIDER≠cloudinary)');
    return;
  }
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    console.log('✅ Cloudinary configuré');
  } catch (err) {
    console.error('❌ Erreur init Cloudinary :', err.message);
    cloudinary = null;
  }
};

initCloudinary();

/**
 * Upload un fichier local vers Cloudinary.
 */
const uploadToCloud = async (localPath, options = {}) => {
  if (!isEnabled() || !cloudinary) {
    return { status: 'disabled', url: null, publicId: null };
  }

  try {
    let resourceType = 'raw';
    const mime = options.mimeType || '';
    if (mime.startsWith('image/')) resourceType = 'image';
    else if (mime.startsWith('video/')) resourceType = 'video';

    const result = await cloudinary.uploader.upload(localPath, {
      folder: options.folder || 'teamkarmagrippa',
      resource_type: resourceType,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    });

    return {
      status: 'synced',
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (err) {
    console.error('❌ Cloudinary upload failed :', err.message);
    return { status: 'failed', url: null, publicId: null, error: err.message };
  }
};

/**
 * Supprime un fichier de Cloudinary par son publicId.
 */
const deleteFromCloud = async (publicId) => {
  if (!isEnabled() || !cloudinary || !publicId) return false;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (err) {
    console.error('❌ Cloudinary delete failed :', err.message);
    return false;
  }
};

module.exports = { uploadToCloud, deleteFromCloud, isEnabled };