const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const GOALS_FILE = path.resolve(
  process.env.GOALS_FILE || path.join(__dirname, '../../goals.json')
);

const NAMES = ['Grant', 'Rico', 'Matthew', 'Sam'];

function readGoals() {
  if (!fs.existsSync(GOALS_FILE)) {
    const defaults = {};
    NAMES.forEach(n => { defaults[n] = ''; });
    fs.writeFileSync(GOALS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
  try {
    return JSON.parse(fs.readFileSync(GOALS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// GET /api/goals
router.get('/', (req, res) => {
  res.json(readGoals());
});

// GET /api/goals/names
router.get('/names', (req, res) => {
  res.json(NAMES);
});

// PUT /api/goals/:name
router.put('/:name', (req, res) => {
  const { name } = req.params;
  if (!NAMES.includes(name)) {
    return res.status(400).json({ error: 'Unknown person' });
  }
  const { goal } = req.body;
  if (typeof goal !== 'string') {
    return res.status(400).json({ error: 'goal must be a string' });
  }
  const goals = readGoals();
  goals[name] = goal.slice(0, 280);
  fs.writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2), 'utf8');
  res.json({ ok: true });
});

module.exports = router;
