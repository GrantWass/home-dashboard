const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const NOTES_FILE = path.resolve(
  process.env.NOTES_FILE || path.join(__dirname, '../../notes.txt')
);

function ensureFile() {
  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, '', 'utf8');
  }
}

// GET /api/notes
router.get('/', (req, res) => {
  ensureFile();
  const content = fs.readFileSync(NOTES_FILE, 'utf8');
  res.json({ content });
});

// PUT /api/notes
router.put('/', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }
  ensureFile();
  fs.writeFileSync(NOTES_FILE, content, 'utf8');
  res.json({ ok: true });
});

module.exports = router;
