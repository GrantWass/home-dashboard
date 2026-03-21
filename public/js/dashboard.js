/* =====================================================================
   Home Dashboard — Kiosk JS
   Designed for monitor display without mouse/keyboard during normal use.
   Mouse/keyboard still work for initial setup via the ⚙ button.
   ===================================================================== */

// ───── Config (persisted in localStorage) ─────
const CONFIG = {
  get cycleInterval() { return parseInt(localStorage.getItem('cycleInterval') || '30', 10) * 1000; },
  set cycleInterval(v) { localStorage.setItem('cycleInterval', String(Math.floor(v / 1000))); },
  get maxActivities() { return parseInt(localStorage.getItem('maxActivities') || '12', 10); },
  set maxActivities(v) { localStorage.setItem('maxActivities', String(v)); },
};

// ───── State ─────
const SECTIONS = ['activities', 'leaderboard', 'weather', 'notes', 'photos'];
let currentSection = 0;
let autoplayTimer = null;
let autoplayStart = null;

let stravaData = null;
let photos = [];
let currentPhoto = 0;
let photoAutoTimer = null;

// ───── DOM refs ─────
const clock          = document.getElementById('clock');
const dateDisplay    = document.getElementById('dateDisplay');
const stravaStatus   = document.getElementById('stravaStatus');
const activityGrid   = document.getElementById('activityGrid');
const lbRunning      = document.getElementById('lbRunning');
const lbCycling      = document.getElementById('lbCycling');
const weekLabel      = document.getElementById('weekLabel');
const weatherMain    = document.getElementById('weatherMain');
const weatherForecast = document.getElementById('weatherForecast');
const weatherLocation = document.getElementById('weatherLocation');
const notesDisplay   = document.getElementById('notesDisplay');
const setupModal     = document.getElementById('setupModal');
const authLinks      = document.getElementById('authLinks');
const slideshow      = document.getElementById('photoSlideshow');
const photoCounter   = document.getElementById('photoCounter');

// ───── Cursor auto-hide ─────
// Cursor shows when mouse moves, hides after 3s idle.
// This lets the mouse work for setup without showing it during normal display.
let cursorHideTimer = null;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(cursorHideTimer);
  cursorHideTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 3000);
});
// Start hidden
document.body.classList.add('cursor-hidden');

// ───── Clock ─────
function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dateDisplay.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ───── Week label ─────
function setWeekLabel() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1) - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (weekLabel) weekLabel.textContent = `Week of ${fmt(mon)} – ${fmt(sun)}`;
}
setWeekLabel();

// ───── Section navigation ─────
function showSection(nameOrIndex) {
  const idx = typeof nameOrIndex === 'string' ? SECTIONS.indexOf(nameOrIndex) : nameOrIndex;
  if (idx < 0) return;
  currentSection = idx;

  document.querySelectorAll('.panel').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.nav-dot').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });

  const name = SECTIONS[idx];
  if (name === 'weather') loadWeather();
  if (name === 'notes')   loadNotes();
  if (name === 'photos')  { loadPhotos(); startPhotoAuto(); }
  else stopPhotoAuto();
}

// ───── Autoplay — always on, starts immediately ─────
const progressContainer = document.createElement('div');
progressContainer.className = 'autoplay-progress';
const progressBar = document.createElement('div');
progressBar.className = 'autoplay-progress-bar';
progressContainer.appendChild(progressBar);
document.body.appendChild(progressContainer);

function startAutoplay() {
  clearTimeout(autoplayTimer);
  const duration = CONFIG.cycleInterval;

  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';
  requestAnimationFrame(() => {
    progressBar.style.transition = `width ${duration}ms linear`;
    progressBar.style.width = '100%';
  });

  autoplayTimer = setTimeout(() => {
    showSection((currentSection + 1) % SECTIONS.length);
    startAutoplay();
  }, duration);
}

// ───── Strava data ─────
async function loadStravaData() {
  try {
    const res = await fetch('/api/strava/data');
    stravaData = await res.json();
    renderActivities();
    renderLeaderboard();
    const updated = stravaData.lastUpdated
      ? `Updated ${new Date(stravaData.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'No data yet';
    stravaStatus.textContent = `Strava: ${updated}`;
  } catch (err) {
    stravaStatus.textContent = 'Strava: error';
    console.error('[Strava]', err);
  }
}

setInterval(loadStravaData, 15 * 60 * 1000);
loadStravaData();

// ───── Activities ─────
function activityTypeClass(type) {
  if (!type) return 'other';
  const t = type.toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike')) return 'ride';
  return 'other';
}

function activityEmoji(type) {
  if (!type) return '🏋️';
  const t = type.toLowerCase();
  if (t.includes('run')) return '🏃';
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike')) return '🚴';
  if (t.includes('swim')) return '🏊';
  if (t.includes('hike') || t.includes('walk')) return '🥾';
  if (t.includes('ski')) return '⛷️';
  if (t.includes('yoga')) return '🧘';
  return '🏋️';
}

function metersToMiles(m) { return (m / 1609.34).toFixed(2); }

function formatPace(distM, timeSec) {
  if (!distM || !timeSec) return '—';
  const paceSecPerMile = timeSec / (distM / 1609.34);
  const mins = Math.floor(paceSecPerMile / 60);
  const secs = Math.round(paceSecPerMile % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatSpeed(mps) {
  if (!mps) return '—';
  return (mps * 2.23694).toFixed(1) + ' mph';
}

function formatDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderActivities() {
  if (!stravaData?.activities) {
    activityGrid.innerHTML = '<div class="loading-msg">No activity data.<br>Complete Strava setup via ⚙</div>';
    return;
  }

  const acts = stravaData.activities.slice(0, CONFIG.maxActivities);

  if (acts.length === 0) {
    activityGrid.innerHTML = '<div class="loading-msg">No activities yet.</div>';
    return;
  }

  const isRun = t => (t || '').toLowerCase().includes('run');

  activityGrid.innerHTML = acts.map(act => {
    const cls = activityTypeClass(act.type);
    const miles = metersToMiles(act.distance);
    const pace  = isRun(act.type) ? formatPace(act.distance, act.movingTime) : null;
    const speed = !isRun(act.type) ? formatSpeed(act.averageSpeed) : null;
    const elev  = act.elevationGain ? `${Math.round(act.elevationGain * 3.28084)} ft` : '—';

    return `
      <div class="activity-card ${cls}">
        ${act.kudosCount > 0 ? `<span class="act-kudos">❤ ${act.kudosCount}</span>` : ''}
        <div class="act-header">
          <div class="act-type-badge">${activityEmoji(act.type)}</div>
          <div class="act-title-block">
            <div class="act-name" title="${escHtml(act.name)}">${escHtml(act.name)}</div>
            <div class="act-athlete">${escHtml(act.athleteName)}</div>
          </div>
          <div class="act-date">${formatDate(act.startDate)}</div>
        </div>
        <div class="act-stats">
          <div class="act-stat">
            <div class="act-stat-label">Distance</div>
            <div class="act-stat-value">${miles} <small style="font-size:.7em;font-weight:400">mi</small></div>
          </div>
          <div class="act-stat">
            <div class="act-stat-label">Time</div>
            <div class="act-stat-value">${formatDuration(act.movingTime)}</div>
          </div>
          <div class="act-stat">
            <div class="act-stat-label">${pace ? 'Pace' : 'Speed'}</div>
            <div class="act-stat-value">${pace ? pace + '<small style="font-size:.7em;font-weight:400"> /mi</small>' : speed}</div>
          </div>
          <div class="act-stat">
            <div class="act-stat-label">Elevation</div>
            <div class="act-stat-value">${elev}</div>
          </div>
          ${act.averageHeartrate ? `
          <div class="act-stat">
            <div class="act-stat-label">Avg HR</div>
            <div class="act-stat-value">${Math.round(act.averageHeartrate)} <small style="font-size:.7em;font-weight:400">bpm</small></div>
          </div>` : ''}
          <div class="act-stat">
            <div class="act-stat-label">Type</div>
            <div class="act-stat-value" style="font-size:.9rem">${escHtml(act.type || '—')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ───── Leaderboard ─────
function renderLeaderboard() {
  if (!stravaData?.leaderboard) {
    lbRunning.innerHTML = '<li style="color:var(--text-dim);padding:14px">No data yet.</li>';
    lbCycling.innerHTML = '<li style="color:var(--text-dim);padding:14px">No data yet.</li>';
    return;
  }

  const board = stravaData.leaderboard;
  const rankColors = ['gold', 'silver', 'bronze'];
  const sortedRun  = [...board].sort((a, b) => b.runMiles - a.runMiles);
  const sortedRide = [...board].sort((a, b) => b.cyclingMiles - a.cyclingMiles);
  const maxRun  = sortedRun[0]?.runMiles || 1;
  const maxRide = sortedRide[0]?.cyclingMiles || 1;

  function renderList(sorted, key) {
    return sorted.map((item, i) => {
      const val = item[key];
      const pct = Math.round((val / (key === 'runMiles' ? maxRun : maxRide)) * 100);
      const countKey = key === 'runMiles' ? 'runCount' : 'rideCount';
      const count = item[countKey];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      return `
        <li class="lb-item">
          <span class="lb-rank ${rankColors[i] || ''}">${medal}</span>
          <div>
            <div class="lb-name">${escHtml(item.name)}</div>
            <div class="lb-subtext">${count} activit${count === 1 ? 'y' : 'ies'}</div>
          </div>
          <div>
            <span class="lb-value">${val.toFixed(1)}</span>
            <span class="lb-unit"> mi</span>
          </div>
          <div class="lb-bar" style="width:${pct}%"></div>
        </li>
      `;
    }).join('');
  }

  lbRunning.innerHTML = renderList(sortedRun, 'runMiles');
  lbCycling.innerHTML = renderList(sortedRide, 'cyclingMiles');
}

// ───── Weather ─────
async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    const w = await res.json();
    if (w.error) throw new Error(w.error);
    renderWeather(w);
  } catch (err) {
    weatherMain.innerHTML = `<div class="loading-msg">Weather unavailable: ${escHtml(err.message)}</div>`;
  }
}

function windDirLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function renderWeather(w) {
  weatherLocation.textContent = `${w.city}, ${w.country}`;
  const WI = 'https://openweathermap.org/img/wn/';
  const sunrise = new Date(w.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset  = new Date(w.sunset  * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  weatherMain.innerHTML = `
    <div class="weather-current">
      <img class="weather-icon-large" src="${WI}${w.icon}@4x.png" alt="${escHtml(w.description)}" />
      <div>
        <div class="weather-temp">${w.temp}${w.unit}</div>
        <div class="weather-desc">${escHtml(w.description)}</div>
        <div class="weather-feels">Feels like ${w.feelsLike}${w.unit} · ${w.tempMin}° / ${w.tempMax}°</div>
      </div>
    </div>
    <div class="weather-details">
      <div class="weather-detail">
        <div class="weather-detail-label">Humidity</div>
        <div class="weather-detail-value">${w.humidity}%</div>
      </div>
      <div class="weather-detail">
        <div class="weather-detail-label">Wind</div>
        <div class="weather-detail-value">${w.windSpeed} ${w.speedUnit} ${windDirLabel(w.windDir)}</div>
      </div>
      <div class="weather-detail">
        <div class="weather-detail-label">Sunrise</div>
        <div class="weather-detail-value">${sunrise}</div>
      </div>
      <div class="weather-detail">
        <div class="weather-detail-label">Sunset</div>
        <div class="weather-detail-value">${sunset}</div>
      </div>
    </div>
  `;

  weatherForecast.innerHTML = (w.forecast || []).map(f => {
    const t = new Date(f.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="forecast-card">
        <div class="forecast-time">${t}</div>
        <img class="forecast-icon" src="${WI}${f.icon}@2x.png" alt="${escHtml(f.description)}" />
        <div class="forecast-temp">${f.temp}°</div>
      </div>
    `;
  }).join('');
}

setInterval(() => {
  if (SECTIONS[currentSection] === 'weather') loadWeather();
}, 10 * 60 * 1000);

// ───── Notes — display only ─────
async function loadNotes() {
  try {
    const res = await fetch('/api/notes');
    const data = await res.json();
    renderNotes(data.content || '');
  } catch (err) {
    console.error('[Notes]', err);
  }
}

function renderNotes(content) {
  if (!content.trim()) {
    notesDisplay.innerHTML = '<span class="notes-empty">No notes yet — add some from your phone.</span>';
  } else {
    notesDisplay.textContent = content;
  }
}

// Poll notes every 60s so phone edits appear on screen
setInterval(async () => {
  try {
    const res = await fetch('/api/notes');
    const data = await res.json();
    renderNotes(data.content || '');
  } catch { /* silent */ }
}, 60 * 1000);

// ───── Photos ─────
async function loadPhotos() {
  try {
    const res = await fetch('/api/photos');
    const latest = await res.json();
    if (JSON.stringify(latest) !== JSON.stringify(photos)) {
      photos = latest;
      renderPhotoSlideshow();
    }
  } catch (err) {
    console.error('[Photos]', err);
  }
}

function renderPhotoSlideshow() {
  if (photos.length === 0) {
    slideshow.innerHTML = `
      <div class="photo-placeholder">
        <p>No photos yet.</p>
        <p class="photo-placeholder-sub">Upload from your phone using the QR code →</p>
      </div>
    `;
    if (photoCounter) photoCounter.style.display = 'none';
    return;
  }

  slideshow.innerHTML = photos.map((url, i) => `
    <img src="${escHtml(url)}" class="${i === currentPhoto ? 'visible' : ''}" alt="Photo ${i + 1}" loading="lazy" />
  `).join('');

  if (photoCounter) {
    photoCounter.style.display = 'block';
    updatePhotoCounter();
  }
}

function showPhoto(idx) {
  currentPhoto = ((idx % photos.length) + photos.length) % photos.length;
  document.querySelectorAll('#photoSlideshow img').forEach((img, i) => {
    img.classList.toggle('visible', i === currentPhoto);
  });
  updatePhotoCounter();
}

function updatePhotoCounter() {
  if (photoCounter && photos.length > 0) {
    photoCounter.textContent = `${currentPhoto + 1} / ${photos.length}`;
  }
}

function startPhotoAuto() {
  stopPhotoAuto();
  if (photos.length <= 1) return;
  photoAutoTimer = setInterval(() => showPhoto(currentPhoto + 1), 8000);
}

function stopPhotoAuto() {
  clearInterval(photoAutoTimer);
}

// Poll for new photos every 30s
setInterval(async () => {
  try {
    const res = await fetch('/api/photos');
    const latest = await res.json();
    if (JSON.stringify(latest) !== JSON.stringify(photos)) {
      const wasEmpty = photos.length === 0;
      photos = latest;
      renderPhotoSlideshow();
      if (wasEmpty && SECTIONS[currentSection] === 'photos') startPhotoAuto();
    }
  } catch { /* silent */ }
}, 30 * 1000);

// ───── QR Code ─────
let mobileUrl = null;

async function initQR() {
  try {
    const res = await fetch('/api/local-ip');
    const { ip, port } = await res.json();
    if (!ip) return;

    mobileUrl = `http://${ip}:${port}/mobile`;

    const qrBox = document.getElementById('qrBox');
    if (!qrBox) return;

    const img = document.createElement('img');
    img.src = '/api/qr.svg';
    img.alt = 'Scan to edit from phone';
    img.style.cssText = 'width:110px;height:110px;border-radius:4px';
    qrBox.appendChild(img);
  } catch (err) {
    console.warn('[QR]', err.message);
  }
}

// ───── Setup modal (mouse-accessible for initial config) ─────
document.getElementById('btnSetup').addEventListener('click', async () => {
  setupModal.style.display = 'flex';
  document.getElementById('cycleInterval').value = CONFIG.cycleInterval / 1000;
  document.getElementById('maxActivities').value = CONFIG.maxActivities;

  const mobileUrlEl = document.getElementById('mobileUrl');
  if (mobileUrlEl) mobileUrlEl.textContent = mobileUrl || 'Loading…';

  try {
    const res = await fetch('/api/strava/athletes');
    const athletes = await res.json();
    authLinks.innerHTML = `<ul class="auth-link-list">${athletes.map(a => `
      <li class="auth-link-item">
        <strong>${escHtml(a.name)}</strong>
        ${a.hasToken
          ? `<span class="token-status token-ok">✓ Connected</span>`
          : `<a href="/api/strava/auth/${a.index}" target="_blank">Connect Strava →</a>
             <span class="token-status token-miss">Not connected</span>`
        }
      </li>
    `).join('')}</ul>`;
  } catch {
    authLinks.innerHTML = '<p style="color:var(--text-dim)">Could not load athlete info.</p>';
  }
});

document.getElementById('btnCloseModal').addEventListener('click', () => {
  CONFIG.cycleInterval = parseInt(document.getElementById('cycleInterval').value, 10) * 1000;
  CONFIG.maxActivities = parseInt(document.getElementById('maxActivities').value, 10);
  renderActivities();
  setupModal.style.display = 'none';
  // Restart autoplay timer with updated interval
  startAutoplay();
});

setupModal.addEventListener('click', e => {
  if (e.target === setupModal) document.getElementById('btnCloseModal').click();
});

// ───── Utils ─────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ───── Quotes ribbon ─────
let quotesData = [];

async function loadQuotes() {
  try {
    const res = await fetch('/api/quotes');
    const latest = await res.json();
    if (JSON.stringify(latest) !== JSON.stringify(quotesData)) {
      quotesData = latest;
      renderQuotesTicker();
    }
  } catch (err) {
    console.error('[Quotes]', err);
  }
}

function renderQuotesTicker() {
  const track = document.getElementById('quotesTrack');
  if (!track) return;

  if (quotesData.length === 0) {
    track.style.animation = 'none';
    track.innerHTML = '<span class="quote-placeholder">Add quotes from your phone ↗</span>';
    return;
  }

  const items = quotesData.map(q => {
    const author = q.author ? `<span class="quote-author">— ${escHtml(q.author)}</span>` : '';
    return `<span class="quote-item">"${escHtml(q.text)}" ${author}</span><span class="quote-sep" aria-hidden="true">●</span>`;
  }).join('');

  // Duplicate content for seamless infinite loop
  track.style.animation = 'none';
  track.innerHTML = items + items;

  // Measure width after paint, then start animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const totalWidth = track.scrollWidth / 2; // half because duplicated
      const pixelsPerSecond = 60;
      const duration = Math.max(totalWidth / pixelsPerSecond, 8);
      track.style.animation = `ticker-scroll ${duration}s linear infinite`;
    });
  });
}

// Refresh quotes every 2 minutes
setInterval(loadQuotes, 2 * 60 * 1000);

// ───── Init ─────
showSection(0);
startAutoplay();   // always on from the start
loadWeather();
loadNotes();
loadPhotos();
loadQuotes();
initQR();
