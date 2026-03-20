const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const PHOTOS_DIR = path.join(__dirname, '../../public/photos');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    cb(null, PHOTOS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// GET /api/photos — list all photo URLs
router.get('/', (req, res) => {
  if (!fs.existsSync(PHOTOS_DIR)) return res.json([]);
  const files = fs.readdirSync(PHOTOS_DIR).filter(f =>
    /\.(jpe?g|png|gif|webp|avif)$/i.test(f)
  );
  const urls = files.map(f => `/photos/${f}`);
  res.json(urls);
});

// POST /api/photos — upload one or more photos
router.post('/', upload.array('photos', 50), (req, res) => {
  const urls = (req.files || []).map(f => `/photos/${f.filename}`);
  res.json({ uploaded: urls });
});

// DELETE /api/photos/:filename
router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(PHOTOS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
