/**
 * Strava data cache — per-athlete credentials
 *
 * Each athlete has their own Strava API app (client_id + client_secret).
 * Strava athlete IDs are discovered automatically after OAuth and stored
 * in tokens.json alongside the access/refresh tokens.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKENS_FILE = path.join(__dirname, '../../tokens.json');

// Load athletes from STRAVA_ATHLETE_N_* env vars
const athletes = [];
let i = 0;
while (process.env[`STRAVA_ATHLETE_${i}_NAME`]) {
  athletes.push({
    index: i,
    name: process.env[`STRAVA_ATHLETE_${i}_NAME`],
    clientId: process.env[`STRAVA_ATHLETE_${i}_CLIENT_ID`] || '',
    clientSecret: process.env[`STRAVA_ATHLETE_${i}_CLIENT_SECRET`] || '',
  });
  i++;
}

let cache = {
  activities: [],
  leaderboard: [],
  lastUpdated: null,
};

// ---------- token persistence ----------
// Tokens are keyed by athlete index (0, 1, 2, ...)
// Each entry: { access_token, refresh_token, expires_at, stravaId }

function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ---------- OAuth helpers ----------

async function refreshAccessToken(athlete, storedRefreshToken) {
  const res = await axios.post('https://www.strava.com/oauth/token', {
    client_id: athlete.clientId,
    client_secret: athlete.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: storedRefreshToken,
  });
  return res.data;
}

async function getAccessToken(athlete) {
  const tokens = loadTokens();
  const entry = tokens[athlete.index];
  if (!entry) throw new Error(`No token for ${athlete.name}. Complete OAuth first.`);

  const nowSec = Math.floor(Date.now() / 1000);
  if (entry.expires_at > nowSec + 60) return entry.access_token;

  // Expired — refresh
  const refreshed = await refreshAccessToken(athlete, entry.refresh_token);
  tokens[athlete.index] = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
    stravaId: entry.stravaId,
  };
  saveTokens(tokens);
  return refreshed.access_token;
}

// ---------- data fetching ----------

async function fetchAthleteActivities(athlete, perPage = 10) {
  const token = await getAccessToken(athlete);
  const res = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
    headers: { Authorization: `Bearer ${token}` },
    params: { per_page: perPage },
  });
  const tokens = loadTokens();
  const stravaId = tokens[athlete.index]?.stravaId || String(athlete.index);
  return res.data.map(act => ({
    id: act.id,
    athleteIndex: athlete.index,
    athleteId: stravaId,
    athleteName: athlete.name,
    name: act.name,
    type: act.type,
    distance: act.distance,
    movingTime: act.moving_time,
    elevationGain: act.total_elevation_gain,
    startDate: act.start_date_local,
    kudosCount: act.kudos_count,
    averageSpeed: act.average_speed,
    maxSpeed: act.max_speed,
    averageHeartrate: act.average_heartrate,
    mapPolyline: act.map?.summary_polyline || null,
  }));
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildLeaderboard(allActivities) {
  const weekStart = getWeekStart();
  const board = {};

  athletes.forEach(a => {
    const tokens = loadTokens();
    const stravaId = tokens[a.index]?.stravaId || String(a.index);
    board[stravaId] = {
      athleteId: stravaId,
      name: a.name,
      runMiles: 0,
      cyclingMiles: 0,
      swimYards: 0,
      runCount: 0,
      rideCount: 0,
      swimCount: 0,
    };
  });

  allActivities.forEach(act => {
    if (new Date(act.startDate) < weekStart) return;
    const entry = board[act.athleteId];
    if (!entry) return;
    const miles = act.distance / 1609.34;
    const yards = act.distance * 1.09361;
    if (act.type === 'Run' || act.type === 'TrailRun') {
      entry.runMiles += miles;
      entry.runCount++;
    } else if (['Ride','VirtualRide','MountainBikeRide','GravelRide'].includes(act.type)) {
      entry.cyclingMiles += miles;
      entry.rideCount++;
    } else if (act.type === 'Swim' || act.type === 'OpenWaterSwim') {
      entry.swimYards += yards;
      entry.swimCount++;
    }
  });

  return Object.values(board).map(e => ({
    ...e,
    runMiles: Math.round(e.runMiles * 10) / 10,
    cyclingMiles: Math.round(e.cyclingMiles * 10) / 10,
    swimYards: Math.round(e.swimYards),
  }));
}

// ---------- public API ----------

async function refresh() {
  const configured = athletes.filter(a => a.clientId && a.clientSecret);
  if (configured.length === 0) throw new Error('No athletes configured with credentials in .env');

  const results = await Promise.allSettled(
    configured.map(a => fetchAthleteActivities(a, 20))
  );

  const allActivities = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allActivities.push(...r.value);
    } else {
      console.warn(`[Strava] Failed to fetch for ${configured[i].name}:`, r.reason.message);
    }
  });

  allActivities.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  cache.activities = allActivities.slice(0, 30);
  cache.leaderboard = buildLeaderboard(allActivities);
  cache.lastUpdated = new Date().toISOString();
}

function getCache() { return cache; }

function storeToken(athleteIndex, tokenData) {
  const tokens = loadTokens();
  tokens[athleteIndex] = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    stravaId: tokenData.athlete ? String(tokenData.athlete.id) : undefined,
  };
  saveTokens(tokens);
}

module.exports = { refresh, getCache, storeToken, athletes, loadTokens };
