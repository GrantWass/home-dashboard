/* =====================================================================
   Home Dashboard — Main JS
   Handles: section navigation, Strava data, weather, notes, photos,
            auto-cycling, clock, leaderboard
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
let autoplayEnabled = false;
let autoplayStart = null;
let autoplayRafId = null;

let stravaData = null;
let currentActivityFilter = 'all';
let photos = [];
let currentPhoto = 0;
let photoAutoTimer = null;

// ───── DOM refs ─────
const clock       = document.getElementById('clock');
const dateDisplay = document.getElementById('dateDisplay');
const stravaStatus = document.getElementById('stravaStatus');
const activityGrid = document.getElementById('activityGrid');
const lbRunning   = document.getElementById('lbRunning');
const lbCycling   = document.getElementById('lbCycling');
const weekLabel   = document.getElementById('weekLabel');
const weatherMain = document.getElementById('weatherMain');
const weatherForecast = document.getElementById('weatherForecast');
const weatherLocation = document.getElementById('weatherLocation');
const notesTextarea = document.getElementById('notesTextarea');
const saveStatus  = document.getElementById('saveStatus');
const setupModal  = document.getElementById('setupModal');
const authLinks   = document.getElementById('authLinks');
const slideshow   = document.getElementById('photoSlideshow');
const photoControls = document.getElementById('photoControls');
const photoCounter  = document.getElementById('photoCounter');

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

  // Lazy-load data when switching to a section
  if (SECTIONS[idx] === 'weather') loadWeather();
  if (SECTIONS[idx] === 'notes') loadNotes();
  if (SECTIONS[idx] === 'photos') loadPhotos();
}

document.querySelectorAll('.nav-dot').forEach((btn, i) => {
  btn.addEventListener('click', () => {
    stopAutoplay();
    showSection(i);
  });
});

// ───── Autoplay ─────
const progressContainer = document.createElement('div');
progressContainer.className = 'autoplay-progress';
const progressBar = document.createElement('div');
progressBar.className = 'autoplay-progress-bar';
progressContainer.appendChild(progressBar);
document.body.appendChild(progressContainer);

const btnAutoplay = document.getElementById('btnAutoplay');

function startAutoplay() {
  autoplayEnabled = true;
  btnAutoplay.textContent = '⏸';
  btnAutoplay.title = 'Pause auto-cycle';
  scheduleNext();
}

function stopAutoplay() {
  autoplayEnabled = false;
  clearTimeout(autoplayTimer);
  cancelAnimationFrame(autoplayRafId);
  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';
  btnAutoplay.textContent = '▶';
  btnAutoplay.title = 'Start auto-cycle';
}

function scheduleNext() {
  if (!autoplayEnabled) return;
  clearTimeout(autoplayTimer);
  cancelAnimationFrame(autoplayRafId);

  const duration = CONFIG.cycleInterval;
  autoplayStart = performance.now();

  // Animate progress bar
  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';
  requestAnimationFrame(() => {
    progressBar.style.transition = `width ${duration}ms linear`;
    progressBar.style.width = '100%';
  });

  autoplayTimer = setTimeout(() => {
    const next = (currentSection + 1) % SECTIONS.length;
    showSection(next);
    scheduleNext();
  }, duration);
}

btnAutoplay.addEventListener('click', () => {
  if (autoplayEnabled) stopAutoplay();
  else startAutoplay();
});

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

// Refresh every 15 minutes on the client too (server also refreshes)
setInterval(loadStravaData, 15 * 60 * 1000);
loadStravaData();

document.getElementById('btnRefreshStrava').addEventListener('click', async () => {
  stravaStatus.textContent = 'Strava: refreshing...';
  await fetch('/api/strava/refresh', { method: 'POST' });
  await loadStravaData();
});

// ───── Activities rendering ─────
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
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderActivities() {
  if (!stravaData || !stravaData.activities) {
    activityGrid.innerHTML = '<div class="loading-msg">No activity data available.<br>Complete Strava setup in ⚙ Settings.</div>';
    return;
  }

  let acts = stravaData.activities;
  if (currentActivityFilter !== 'all') {
    acts = acts.filter(a => {
      const t = (a.type || '').toLowerCase();
      if (currentActivityFilter === 'Run') return t.includes('run');
      if (currentActivityFilter === 'Ride') return t.includes('ride') || t.includes('cycl') || t.includes('bike');
      return true;
    });
  }

  acts = acts.slice(0, CONFIG.maxActivities);

  if (acts.length === 0) {
    activityGrid.innerHTML = '<div class="loading-msg">No activities match this filter.</div>';
    return;
  }

  const isRun = type => (type || '').toLowerCase().includes('run');

  activityGrid.innerHTML = acts.map(act => {
    const cls = activityTypeClass(act.type);
    const emoji = activityEmoji(act.type);
    const miles = metersToMiles(act.distance);
    const pace = isRun(act.type) ? formatPace(act.distance, act.movingTime) : null;
    const speed = !isRun(act.type) ? formatSpeed(act.averageSpeed) : null;
    const elev = act.elevationGain ? `${Math.round(act.elevationGain * 3.28084)} ft` : '—';

    return `
      <div class="activity-card ${cls}">
        ${act.kudosCount > 0 ? `<span class="act-kudos">❤ ${act.kudosCount}</span>` : ''}
        <div class="act-header">
          <div class="act-type-badge">${emoji}</div>
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
            <div class="act-stat-value">${pace ? pace + '<small style="font-size:.7em;font-weight:400">/mi</small>' : speed}</div>
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

// Activity filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentActivityFilter = btn.dataset.type;
    renderActivities();
  });
});

// ───── Leaderboard rendering ─────
function renderLeaderboard() {
  if (!stravaData || !stravaData.leaderboard) {
    lbRunning.innerHTML = '<li style="color:var(--text-dim);padding:12px">No data yet.</li>';
    lbCycling.innerHTML = '<li style="color:var(--text-dim);padding:12px">No data yet.</li>';
    return;
  }

  const board = stravaData.leaderboard;
  const rankColors = ['gold', 'silver', 'bronze'];

  const sortedRun = [...board].sort((a, b) => b.runMiles - a.runMiles);
  const sortedRide = [...board].sort((a, b) => b.cyclingMiles - a.cyclingMiles);
  const maxRun = sortedRun[0]?.runMiles || 1;
  const maxRide = sortedRide[0]?.cyclingMiles || 1;

  function renderList(sorted, key, unit) {
    return sorted.map((item, i) => {
      const val = item[key];
      const pct = Math.round((val / (key === 'runMiles' ? maxRun : maxRide)) * 100);
      const countKey = key === 'runMiles' ? 'runCount' : 'rideCount';
      const count = item[countKey];
      return `
        <li class="lb-item">
          <span class="lb-rank ${rankColors[i] || ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
          <div>
            <div class="lb-name">${escHtml(item.name)}</div>
            <div class="lb-subtext">${count} activit${count === 1 ? 'y' : 'ies'}</div>
          </div>
          <div>
            <span class="lb-value">${val.toFixed(1)}</span>
            <span class="lb-unit"> ${unit}</span>
          </div>
          <div class="lb-bar" style="width:${pct}%"></div>
        </li>
      `;
    }).join('');
  }

  lbRunning.innerHTML = renderList(sortedRun, 'runMiles', 'mi');
  lbCycling.innerHTML = renderList(sortedRide, 'cyclingMiles', 'mi');
}

// ───── Weather ─────
const WI_BASE = 'https://openweathermap.org/img/wn/';

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

  const sunrise = new Date(w.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset  = new Date(w.sunset  * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  weatherMain.innerHTML = `
    <div class="weather-current">
      <img class="weather-icon-large" src="${WI_BASE}${w.icon}@4x.png" alt="${escHtml(w.description)}" />
      <div class="weather-temp-block">
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
        <img class="forecast-icon" src="${WI_BASE}${f.icon}@2x.png" alt="${escHtml(f.description)}" />
        <div class="forecast-temp">${f.temp}°</div>
      </div>
    `;
  }).join('');
}

// Refresh weather every 10 min
setInterval(() => {
  if (SECTIONS[currentSection] === 'weather') loadWeather();
}, 10 * 60 * 1000);

// ───── Notes ─────
async function loadNotes() {
  try {
    const res = await fetch('/api/notes');
    const data = await res.json();
    notesTextarea.value = data.content || '';
  } catch (err) {
    console.error('[Notes]', err);
  }
}

let notesDebounce = null;
notesTextarea.addEventListener('input', () => {
  saveStatus.textContent = '';
  clearTimeout(notesDebounce);
  notesDebounce = setTimeout(saveNotes, 2000);
});

document.getElementById('btnSaveNotes').addEventListener('click', saveNotes);

async function saveNotes() {
  clearTimeout(notesDebounce);
  try {
    await fetch('/api/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: notesTextarea.value }),
    });
    saveStatus.textContent = '✓ Saved';
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  } catch (err) {
    saveStatus.textContent = '✗ Error';
    console.error('[Notes save]', err);
  }
}

// ───── Photos ─────
async function loadPhotos() {
  try {
    const res = await fetch('/api/photos');
    photos = await res.json();
    renderPhotoSlideshow();
  } catch (err) {
    console.error('[Photos]', err);
  }
}

function renderPhotoSlideshow() {
  if (photos.length === 0) {
    slideshow.innerHTML = `
      <div class="photo-placeholder">
        <p>No photos yet.</p>
        <label class="btn-primary upload-label">
          Upload Photos
          <input type="file" accept="image/*" multiple id="photoUploadInput" style="display:none" />
        </label>
      </div>
    `;
    document.getElementById('photoUploadInput').addEventListener('change', handlePhotoUpload);
    photoControls.style.display = 'none';
    return;
  }

  // Create all img elements
  slideshow.innerHTML = photos.map((url, i) => `
    <img src="${escHtml(url)}" class="${i === currentPhoto ? 'visible' : ''}" alt="Photo ${i+1}" loading="lazy" />
  `).join('');
  photoControls.style.display = 'flex';
  updatePhotoCounter();

  // Bind upload
  document.getElementById('photoUploadInput2')?.addEventListener('change', handlePhotoUpload);
}

function showPhoto(idx) {
  currentPhoto = ((idx % photos.length) + photos.length) % photos.length;
  document.querySelectorAll('#photoSlideshow img').forEach((img, i) => {
    img.classList.toggle('visible', i === currentPhoto);
  });
  updatePhotoCounter();
}

function updatePhotoCounter() {
  if (photoCounter) photoCounter.textContent = `${currentPhoto + 1} / ${photos.length}`;
}

document.getElementById('photoPrev').addEventListener('click', () => showPhoto(currentPhoto - 1));
document.getElementById('photoNext').addEventListener('click', () => showPhoto(currentPhoto + 1));

// Auto-advance photos every 8 seconds when in photos section
function startPhotoAuto() {
  stopPhotoAuto();
  if (photos.length <= 1) return;
  photoAutoTimer = setInterval(() => showPhoto(currentPhoto + 1), 8000);
}
function stopPhotoAuto() {
  clearInterval(photoAutoTimer);
}

// Override showSection to manage photo auto-advance
const origShowSection = showSection;

async function handlePhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (const f of files) formData.append('photos', f);

  try {
    await fetch('/api/photos', { method: 'POST', body: formData });
    const res = await fetch('/api/photos');
    photos = await res.json();
    currentPhoto = Math.max(0, photos.length - files.length);
    renderPhotoSlideshow();
  } catch (err) {
    console.error('[Upload]', err);
  }
}

// ───── Keyboard navigation ─────
document.addEventListener('keydown', e => {
  if (e.target === notesTextarea) return; // don't hijack text input
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      stopAutoplay();
      showSection((currentSection + 1) % SECTIONS.length);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      stopAutoplay();
      showSection((currentSection - 1 + SECTIONS.length) % SECTIONS.length);
      break;
    case ' ':
      e.preventDefault();
      if (autoplayEnabled) stopAutoplay(); else startAutoplay();
      break;
    case 'r':
    case 'R':
      document.getElementById('btnRefreshStrava').click();
      break;
  }
});

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

    // Load QR as server-rendered SVG (works fully offline on the Pi)
    const img = document.createElement('img');
    img.src = '/api/qr.svg';
    img.alt = 'Mobile QR code';
    img.style.cssText = 'width:100px;height:100px;border-radius:4px';
    qrBox.appendChild(img);

    // Clicking the widget opens the mobile URL in a new tab
    document.getElementById('qrWidget').addEventListener('click', () => {
      window.open(mobileUrl, '_blank');
    });
  } catch (err) {
    console.warn('[QR]', err.message);
  }
}

// ───── Setup modal ─────
document.getElementById('btnSetup').addEventListener('click', async () => {
  setupModal.style.display = 'flex';
  document.getElementById('cycleInterval').value = CONFIG.cycleInterval / 1000;
  document.getElementById('maxActivities').value = CONFIG.maxActivities;

  // Show mobile URL
  const mobileUrlEl = document.getElementById('mobileUrl');
  if (mobileUrlEl) mobileUrlEl.textContent = mobileUrl || 'Starting server… try again in a moment.';

  // Load athlete token status
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
});

setupModal.addEventListener('click', e => {
  if (e.target === setupModal) {
    document.getElementById('btnCloseModal').click();
  }
});

// ───── Utils ─────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ───── Poll for photo + notes updates (so phone uploads appear on screen) ─────
// Reload photos every 30s (lightweight — just a JSON list of filenames)
setInterval(async () => {
  try {
    const res = await fetch('/api/photos');
    const latest = await res.json();
    // Only re-render if the list actually changed
    if (JSON.stringify(latest) !== JSON.stringify(photos)) {
      photos = latest;
      if (SECTIONS[currentSection] === 'photos') renderPhotoSlideshow();
    }
  } catch { /* silent */ }
}, 30 * 1000);

// Reload notes every 60s so edits from phones appear
setInterval(async () => {
  if (SECTIONS[currentSection] !== 'notes') {
    try {
      const res = await fetch('/api/notes');
      const data = await res.json();
      // Only overwrite if the textarea isn't focused (don't stomp an in-progress edit)
      if (document.activeElement !== notesTextarea) {
        notesTextarea.value = data.content || '';
      }
    } catch { /* silent */ }
  }
}, 60 * 1000);

// ───── Init ─────
showSection(0);
loadWeather();
loadNotes();
loadPhotos();
initQR();
