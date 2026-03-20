const express = require('express');
const axios = require('axios');
const router = express.Router();
const stravaCache = require('../cache/stravaCache');

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI_BASE = `http://localhost:${process.env.PORT || 3000}/api/strava/callback`;

// GET /api/strava/data — returns cached activities and leaderboard
router.get('/data', (req, res) => {
  const data = stravaCache.getCache();
  res.json(data);
});

// GET /api/strava/athletes — list configured athletes and their token status
router.get('/athletes', (req, res) => {
  const tokens = stravaCache.loadTokens();
  const athletes = stravaCache.athletes.map((a, i) => ({
    index: i,
    id: a.id,
    name: a.name,
    hasToken: !!tokens[a.id],
  }));
  res.json(athletes);
});

// GET /api/strava/auth/:athleteIndex — redirect to Strava OAuth for athlete N
router.get('/auth/:athleteIndex', (req, res) => {
  const index = parseInt(req.params.athleteIndex, 10);
  const athlete = stravaCache.athletes[index];
  if (!athlete) return res.status(404).json({ error: 'Athlete index not found' });

  const url = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI_BASE)}&approval_prompt=auto&scope=read,activity:read&state=${index}`;
  res.redirect(url);
});

// GET /api/strava/callback — handle Strava OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Strava auth denied: ${error}`);

  const index = parseInt(state, 10);
  const athlete = stravaCache.athletes[index];
  if (!athlete) return res.status(400).send('Invalid state (athlete index)');

  try {
    const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    stravaCache.storeToken(athlete.id, tokenRes.data);
    res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#eee;">
        <h2>✓ Strava connected for ${athlete.name}</h2>
        <p>Token saved. You can close this tab.</p>
        <p><a href="/" style="color:#fc4c02;">← Back to Dashboard</a></p>
      </body></html>
    `);
  } catch (err) {
    console.error('[Strava OAuth]', err.response?.data || err.message);
    res.status(500).send('OAuth token exchange failed: ' + (err.response?.data?.message || err.message));
  }
});

// POST /api/strava/refresh — manually trigger cache refresh
router.post('/refresh', async (req, res) => {
  try {
    await stravaCache.refresh();
    res.json({ ok: true, lastUpdated: stravaCache.getCache().lastUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
