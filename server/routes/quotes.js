const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const QUOTES_FILE = path.resolve(
  process.env.QUOTES_FILE || path.join(__dirname, '../../quotes.json')
);

function readQuotes() {
  if (!fs.existsSync(QUOTES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeQuotes(quotes) {
  fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotes, null, 2), 'utf8');
}

// GET /api/quotes
router.get('/', (req, res) => {
  res.json(readQuotes());
});

// POST /api/quotes  { text, author? }
router.post('/', (req, res) => {
  const { text, author } = req.body;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const quotes = readQuotes();
  const quote = { id: Date.now(), text: text.trim(), author: (author || '').trim() };
  quotes.push(quote);
  writeQuotes(quotes);
  res.status(201).json(quote);
});

// DELETE /api/quotes/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const quotes = readQuotes().filter(q => q.id !== id);
  writeQuotes(quotes);
  res.json({ ok: true });
});

module.exports = router;
