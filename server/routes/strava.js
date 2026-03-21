const express = require('express');
const axios = require('axios');
const router = express.Router();
const stravaCache = require('../cache/stravaCache');

function getRedirectUri(req) {
  const host = req.headers.host || `localhost:${process.env.PORT || 3000}`;
  return `http://${host}/api/strava/callback`;
}

// GET /api/strava/data — returns cached activities and leaderboard
router.get('/data', (req, res) => {
  res.json(stravaCache.getCache());
});

// GET /api/strava/athletes — list configured athletes and their token status
router.get('/athletes', (req, res) => {
  const tokens = stravaCache.loadTokens();
  res.json(stravaCache.athletes.map(a => ({
    index: a.index,
    name: a.name,
    hasCredentials: !!(a.clientId && a.clientSecret),
    hasToken: !!tokens[a.index],
  })));
});

// GET /api/strava/auth/:athleteIndex — redirect to Strava OAuth for athlete N
router.get('/auth/:athleteIndex', (req, res) => {
  const index = parseInt(req.params.athleteIndex, 10);
  const athlete = stravaCache.athletes[index];
  if (!athlete) return res.status(404).json({ error: 'Athlete index not found' });
  if (!athlete.clientId || !athlete.clientSecret) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#eee;">
        <h2>⚠ Missing credentials for ${athlete.name}</h2>
        <p>Add <code>STRAVA_ATHLETE_${index}_CLIENT_ID</code> and <code>STRAVA_ATHLETE_${index}_CLIENT_SECRET</code> to your .env file first.</p>
      </body></html>
    `);
  }

  const url = `https://www.strava.com/oauth/authorize?client_id=${athlete.clientId}&response_type=code&redirect_uri=${encodeURIComponent(getRedirectUri(req))}&approval_prompt=auto&scope=read,activity:read&state=${index}`;
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
      client_id: athlete.clientId,
      client_secret: athlete.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(req),
    });

    stravaCache.storeToken(index, tokenRes.data);
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
