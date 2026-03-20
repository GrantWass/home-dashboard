require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const stravaRouter = require('./routes/strava');
const weatherRouter = require('./routes/weather');
const notesRouter = require('./routes/notes');
const photosRouter = require('./routes/photos');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/strava', stravaRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/notes', notesRouter);
app.use('/api/photos', photosRouter);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Pre-fetch Strava data every 15 minutes
const stravaCache = require('./cache/stravaCache');
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] Refreshing Strava data...');
  try {
    await stravaCache.refresh();
    console.log('[CRON] Strava data refreshed successfully.');
  } catch (err) {
    console.error('[CRON] Failed to refresh Strava data:', err.message);
  }
});

// Initial fetch on startup
stravaCache.refresh().then(() => {
  console.log('[STARTUP] Strava data loaded.');
}).catch(err => {
  console.warn('[STARTUP] Could not load Strava data:', err.message);
});

app.listen(PORT, () => {
  console.log(`Home dashboard running at http://localhost:${PORT}`);
});
