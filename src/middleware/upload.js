const multer  = require('multer');
const path    = require('path');
const { uploadToCloudinary } = require('../config/cloudinary');

const MAX_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

// Use memory storage — no disk writes (required for Vercel serverless)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = {
    photo:    ['.jpg', '.jpeg', '.png', '.webp'],
    document: ['.jpg', '.jpeg', '.png', '.pdf'],
  };
  const ext = path.extname(file.originalname).toLowerCase();
  const key = file.fieldname === 'photo' ? 'photo' : 'document';
  if (allowed[key].includes(ext)) return cb(null, true);
  cb(new Error(`Invalid file type. Allowed: ${allowed[key].join(', ')}`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

// Middleware wrappers
const uploadPhoto    = upload.single('photo');
const uploadDocument = upload.single('document');
const uploadBoth     = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'document', maxCount: 1 }]);

// Error handler for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ success: false, message: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 5}MB.` });
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
};

/**
 * Upload files in req.files to Cloudinary and attach secure URLs to req.fileUrls
 * Call this AFTER uploadBoth middleware.
 */
const processUploads = async (req, res, next) => {
  try {
    req.fileUrls = { photo: null, document: null };

    const prefix = req.user?.id ? req.user.id.slice(0, 8) : 'anon';
    const ts     = Date.now();

    const photoFile    = req.files?.photo?.[0]    || null;
    const documentFile = req.files?.document?.[0] || null;

    // Upload both files in PARALLEL — cuts wait time in half
    const [photoUrl, documentUrl] = await Promise.all([
      photoFile
        ? uploadToCloudinary(photoFile.buffer, 'gsrtc/photos', `${prefix}_photo_${ts}`)
        : Promise.resolve(null),
      documentFile
        ? uploadToCloudinary(documentFile.buffer, 'gsrtc/documents', `${prefix}_doc_${ts}`)
        : Promise.resolve(null),
    ]);

    req.fileUrls.photo    = photoUrl;
    req.fileUrls.document = documentUrl;

    next();
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    return res.status(500).json({ success: false, message: 'File upload to cloud failed. Please try again.' });
  }
};

// Legacy helper kept for backward compat (no longer used for new uploads)
const getFileUrl = (diskPath) => {
  if (!diskPath) return null;
  return '/uploads/' + diskPath.split('/uploads/')[1]?.replace(/\\/g, '/');
};

module.exports = { uploadPhoto, uploadDocument, uploadBoth, handleUploadError, processUploads, getFileUrl };
