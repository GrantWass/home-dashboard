/**
 * Strava data cache - stores pre-fetched activities and leaderboard
 * data so the frontend gets instant responses.
 *
 * Each athlete needs their own OAuth token. On first run, you must
 * complete the OAuth flow for each athlete (see /api/strava/auth/:athleteIndex).
 * Tokens are persisted to tokens.json so they survive restarts.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKENS_FILE = path.join(__dirname, '../../tokens.json');
const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

const RAW_IDS = (process.env.STRAVA_ATHLETE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const RAW_NAMES = (process.env.STRAVA_ATHLETE_NAMES || '').split(',').map(s => s.trim());

const athletes = RAW_IDS.map((id, i) => ({
  id,
  name: RAW_NAMES[i] || `Athlete ${i + 1}`,
}));

let cache = {
  activities: [],   // last ~20 combined activities across all athletes
  leaderboard: [],  // weekly running miles + cycling volume per athlete
  lastUpdated: null,
};

// ---------- token persistence ----------

function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ---------- OAuth helpers ----------

async function refreshToken(athleteId, refreshToken) {
  const res = await axios.post('https://www.strava.com/oauth/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return res.data; // { access_token, refresh_token, expires_at, ... }
}

async function getAccessToken(athleteId) {
  const tokens = loadTokens();
  const entry = tokens[athleteId];
  if (!entry) throw new Error(`No token stored for athlete ${athleteId}. Complete OAuth first.`);

  const nowSec = Math.floor(Date.now() / 1000);
  if (entry.expires_at > nowSec + 60) {
    return entry.access_token;
  }

  // Token expired – refresh
  const refreshed = await refreshToken(athleteId, entry.refresh_token);
  tokens[athleteId] = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
  };
  saveTokens(tokens);
  return refreshed.access_token;
}

// ---------- data fetching ----------

async function fetchAthleteActivities(athlete, perPage = 10) {
  const token = await getAccessToken(athlete.id);
  const res = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
    headers: { Authorization: `Bearer ${token}` },
    params: { per_page: perPage },
  });
  return res.data.map(act => ({
    id: act.id,
    athleteId: athlete.id,
    athleteName: athlete.name,
    name: act.name,
    type: act.type,
    distance: act.distance,       // meters
    movingTime: act.moving_time,  // seconds
    elevationGain: act.total_elevation_gain, // meters
    startDate: act.start_date_local,
    kudosCount: act.kudos_count,
    averageSpeed: act.average_speed, // m/s
    maxSpeed: act.max_speed,
    averageHeartrate: act.average_heartrate,
    mapPolyline: act.map?.summary_polyline || null,
  }));
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildLeaderboard(allActivities) {
  const weekStart = getWeekStart();
  const board = {};

  athletes.forEach(a => {
    board[a.id] = {
      athleteId: a.id,
      name: a.name,
      runMiles: 0,
      cyclingMiles: 0,
      runCount: 0,
      rideCount: 0,
    };
  });

  allActivities.forEach(act => {
    const actDate = new Date(act.startDate);
    if (actDate < weekStart) return;
    const entry = board[act.athleteId];
    if (!entry) return;

    const miles = act.distance / 1609.34;
    if (act.type === 'Run' || act.type === 'TrailRun') {
      entry.runMiles += miles;
      entry.runCount++;
    } else if (act.type === 'Ride' || act.type === 'VirtualRide' || act.type === 'MountainBikeRide' || act.type === 'GravelRide') {
      entry.cyclingMiles += miles;
      entry.rideCount++;
    }
  });

  return Object.values(board).map(e => ({
    ...e,
    runMiles: Math.round(e.runMiles * 10) / 10,
    cyclingMiles: Math.round(e.cyclingMiles * 10) / 10,
  }));
}

// ---------- public API ----------

async function refresh() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set in .env');
  }
  if (athletes.length === 0) {
    throw new Error('STRAVA_ATHLETE_IDS must be set in .env');
  }

  const results = await Promise.allSettled(
    athletes.map(a => fetchAthleteActivities(a, 20))
  );

  const allActivities = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allActivities.push(...r.value);
    } else {
      console.warn(`[Strava] Failed to fetch for ${athletes[i].name}:`, r.reason.message);
    }
  });

  // Sort combined by most recent
  allActivities.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  cache.activities = allActivities.slice(0, 30);
  cache.leaderboard = buildLeaderboard(allActivities);
  cache.lastUpdated = new Date().toISOString();
}

function getCache() {
  return cache;
}

function storeToken(athleteId, tokenData) {
  const tokens = loadTokens();
  tokens[athleteId] = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
  };
  saveTokens(tokens);
}

module.exports = { refresh, getCache, storeToken, athletes, loadTokens };
