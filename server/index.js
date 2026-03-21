require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const cron = require('node-cron');

const stravaRouter = require('./routes/strava');
const weatherRouter = require('./routes/weather');
const notesRouter = require('./routes/notes');
const photosRouter = require('./routes/photos');
const quotesRouter = require('./routes/quotes');

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
app.use('/api/quotes', quotesRouter);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve mobile companion page
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/mobile.html'));
});

// Return local network IP
app.get('/api/local-ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = null;
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
    }
    if (localIp) break;
  }
  res.json({ ip: localIp, port: PORT });
});

// Serve a QR code SVG pointing at the mobile page
const QRCode = require('qrcode');
app.get('/api/qr.svg', async (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
    }
    if (localIp !== 'localhost') break;
  }
  const url = `http://${localIp}:${PORT}/mobile`;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
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

app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
    }
    if (localIp !== 'localhost') break;
  }
  console.log(`Home dashboard running at:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIp}:${PORT}`);
  console.log(`  Mobile:  http://${localIp}:${PORT}/mobile`);
});
