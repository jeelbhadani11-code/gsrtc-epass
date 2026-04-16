const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOAD_DIR     = process.env.UPLOAD_DIR
  ? require('path').resolve(process.env.UPLOAD_DIR)
  : (process.env.VERCEL ? '/tmp/uploads' : require('path').resolve(__dirname, '../../uploads'));
const MAX_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

// Ensure upload directories exist
['photos', 'documents'].forEach(dir => {
  const p = path.join(UPLOAD_DIR, dir);
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch (err) {
    if (err.code !== 'EROFS') {
      console.error(`Failed to create directory ${p}:`, err.message);
    }
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'photo' ? 'photos' : 'documents';
    cb(null, path.join(UPLOAD_DIR, dir));
  },
  filename: (req, file, cb) => {
    const ext    = path.extname(file.originalname).toLowerCase();
    const prefix = req.user?.id ? req.user.id.slice(0, 8) : 'anon';
    const ts     = Date.now();
    cb(null, `${prefix}_${ts}${ext}`);
  },
});

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

// Get public URL path from disk path
const getFileUrl = (diskPath) => {
  if (!diskPath) return null;
  return '/uploads/' + diskPath.split('/uploads/')[1]?.replace(/\\/g, '/');
};

module.exports = { uploadPhoto, uploadDocument, uploadBoth, handleUploadError, getFileUrl };
