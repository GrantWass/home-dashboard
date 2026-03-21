/* =====================================================================
   Home Dashboard — Single-Page Kiosk JS
   Everything visible at once on a large monitor.
   ===================================================================== */

// ───── DOM refs ─────
const clock              = document.getElementById('clock');
const dateDisplay        = document.getElementById('dateDisplay');
const stravaStatus       = document.getElementById('stravaStatus');
const activityGrid       = document.getElementById('activityGrid');
const leaderboardCompact = document.getElementById('leaderboardCompact');
const weatherBar         = document.getElementById('weatherBar');
const notesText          = document.getElementById('notesText');
const notesRibbon        = document.getElementById('notesRibbon');
const setupModal         = document.getElementById('setupModal');
const authLinks          = document.getElementById('authLinks');
const slideshow          = document.getElementById('photoSlideshow');
const photoCounter       = document.getElementById('photoCounter');

// ───── State ─────
let stravaData = null;
let photos = [];
let currentPhoto = 0;
let photoAutoTimer = null;

// ───── Cursor auto-hide ─────
let cursorHideTimer = null;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(cursorHideTimer);
  cursorHideTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 3000);
});
document.body.classList.add('cursor-hidden');

// ───── Clock ─────
function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dateDisplay.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ───── Strava ─────
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

// ───── Route map helpers ─────
function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function routeMapSvg(encoded, color) {
  if (!encoded) return '';
  const pts = decodePolyline(encoded);
  if (pts.length < 2) return '';

  const lats = pts.map(p => p[0]);
  const lngs = pts.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latR = maxLat - minLat || 0.0001;
  const lngR = maxLng - minLng || 0.0001;

  const pad = 10, size = 100, inner = size - pad * 2;
  const scale = Math.min(inner / lngR, inner / latR);
  const sw = lngR * scale, sh = latR * scale;
  const ox = pad + (inner - sw) / 2, oy = pad + (inner - sh) / 2;

  const d = pts.map(([lat, lng], i) => {
    const x = (ox + ((lng - minLng) / lngR) * sw).toFixed(1);
    const y = (oy + ((maxLat - lat) / latR) * sh).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ───── Activity helpers ─────
function actTypeClass(type) {
  if (!type) return 'other';
  const t = type.toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike')) return 'ride';
  return 'other';
}

function actEmoji(type) {
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

function toMiles(m) { return (m / 1609.34).toFixed(1); }

function formatPace(distM, timeSec) {
  if (!distM || !timeSec) return '—';
  const spm = timeSec / (distM / 1609.34);
  return `${Math.floor(spm / 60)}:${Math.round(spm % 60).toString().padStart(2, '0')}`;
}

function formatSpeed(mps) {
  return mps ? (mps * 2.23694).toFixed(1) + ' mph' : '—';
}

function formatDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ───── Activities — last 2 per athlete ─────
function renderActivities() {
  if (!stravaData?.activities?.length) {
    activityGrid.innerHTML = '<div class="loading-msg" style="grid-column:1/-1">No activity data — complete Strava setup via ⚙</div>';
    return;
  }

  // Athlete list from leaderboard (preserves .env order)
  const athletes = (stravaData.leaderboard || []).map(a => ({ id: a.athleteId, name: a.name }));

  // Group activities by athlete, max 2 each (already sorted newest-first)
  const byAthlete = {};
  for (const act of stravaData.activities) {
    if (!byAthlete[act.athleteId]) byAthlete[act.athleteId] = [];
    if (byAthlete[act.athleteId].length < 2) byAthlete[act.athleteId].push(act);
  }

  const isRun = t => (t || '').toLowerCase().includes('run');
  const mapColors = { run: '#fc4c02', ride: '#4a9ab8', other: '#7db87d' };

  const cols = athletes.map(athlete => {
    const acts = byAthlete[athlete.id] || [];

    const cards = acts.map(act => {
      const cls   = actTypeClass(act.type);
      const miles = toMiles(act.distance);
      const pace  = isRun(act.type) ? formatPace(act.distance, act.movingTime) : null;
      const speed = !isRun(act.type) ? formatSpeed(act.averageSpeed) : null;
      const elev  = act.elevationGain ? `${Math.round(act.elevationGain * 3.281)} ft` : '—';
      const hr    = act.averageHeartrate ? `${Math.round(act.averageHeartrate)} bpm` : null;
      const mapSvg = routeMapSvg(act.mapPolyline, mapColors[cls] || '#888');

      const kudos = act.kudosCount > 0 ? `❤ ${act.kudosCount}` : '—';

      return `
        <div class="activity-card ${cls}">
          ${mapSvg ? `<div class="act-map">${mapSvg}</div>` : ''}
          <div class="act-top">
            <span class="act-emoji">${actEmoji(act.type)}</span>
            <span class="act-name" title="${escHtml(act.name)}">${escHtml(act.name)}</span>
            <span class="act-date-sm">${formatDate(act.startDate)}</span>
          </div>
          <div class="act-stats-mini">
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">Dist</div>
              <div class="act-stat-mini-value">${miles} mi</div>
            </div>
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">Time</div>
              <div class="act-stat-mini-value">${formatDuration(act.movingTime)}</div>
            </div>
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">${pace ? 'Pace' : 'Speed'}</div>
              <div class="act-stat-mini-value">${pace ? pace + '/mi' : speed}</div>
            </div>
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">Elev</div>
              <div class="act-stat-mini-value">${elev}</div>
            </div>
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">Avg HR</div>
              <div class="act-stat-mini-value">${hr || '—'}</div>
            </div>
            <div class="act-stat-mini">
              <div class="act-stat-mini-label">Kudos</div>
              <div class="act-stat-mini-value">${kudos}</div>
            </div>
          </div>
        </div>
      `;
    });

    // Pad with placeholder if fewer than 2
    while (cards.length < 2) {
      cards.push('<div class="activity-card act-empty"><span class="act-empty-text">No recent activity</span></div>');
    }

    return `
      <div class="athlete-col">
        <div class="athlete-name-label">${escHtml(athlete.name)}</div>
        ${cards.join('')}
      </div>
    `;
  }).join('');

  activityGrid.innerHTML = cols;
}

// ───── Leaderboard — compact ─────
function renderLeaderboard() {
  if (!stravaData?.leaderboard) {
    leaderboardCompact.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;padding:8px;grid-column:1/-1">No data yet.</div>';
    return;
  }

  const board = stravaData.leaderboard;
  const rankColors = ['var(--gold)', 'var(--silver)', 'var(--bronze)', 'var(--text-dim)'];
  const sortedRun  = [...board].sort((a, b) => b.runMiles - a.runMiles);
  const sortedRide = [...board].sort((a, b) => b.cyclingMiles - a.cyclingMiles);
  const maxRun  = sortedRun[0]?.runMiles || 1;
  const maxRide = sortedRide[0]?.cyclingMiles || 1;

  function colHtml(sorted, key, maxVal, color) {
    const rows = sorted.map((item, i) => {
      const val = item[key];
      const pct = Math.round((val / maxVal) * 100);
      return `
        <div class="lb-compact-row">
          <span class="lb-compact-rank" style="color:${rankColors[i]}">${i + 1}</span>
          <span class="lb-compact-name">${escHtml(item.name)}</span>
          <span class="lb-compact-val">${val.toFixed(1)}</span><span class="lb-compact-unit">mi</span>
        </div>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      `;
    }).join('');
    return rows;
  }

  leaderboardCompact.innerHTML = `
    <div class="lb-compact-col">
      <div class="lb-compact-title">🏃 Running</div>
      <div class="lb-compact-rows">${colHtml(sortedRun, 'runMiles', maxRun, 'var(--run-color)')}</div>
    </div>
    <div class="lb-compact-col">
      <div class="lb-compact-title">🚴 Cycling</div>
      <div class="lb-compact-rows">${colHtml(sortedRide, 'cyclingMiles', maxRide, 'var(--ride-color)')}</div>
    </div>
  `;
}

// ───── Weather ─────
async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    const w = await res.json();
    if (w.error) throw new Error(w.error);
    renderWeather(w);
  } catch (err) {
    weatherBar.innerHTML = '<div class="loading-msg">Weather unavailable.</div>';
    console.error('[Weather]', err);
  }
}

function windDir(deg) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
}

function renderWeather(w) {
  const WI = 'https://openweathermap.org/img/wn/';
  const sunrise = new Date(w.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset  = new Date(w.sunset  * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const forecastHtml = (w.forecast || []).slice(0, 8).map(f => {
    const t = new Date(f.time * 1000).toLocaleTimeString([], { hour: 'numeric', hour12: true });
    return `
      <div class="wb-forecast-chip">
        <div class="wb-forecast-time">${t}</div>
        <img src="${WI}${f.icon}@2x.png" alt="" />
        <div class="wb-forecast-temp">${f.temp}°</div>
      </div>
    `;
  }).join('');

  weatherBar.innerHTML = `
    <div class="wb-current">
      <img class="wb-icon" src="${WI}${w.icon}@2x.png" alt="${escHtml(w.description)}" />
      <div class="wb-temp">${w.temp}${w.unit}</div>
      <div class="wb-desc-block">
        <span class="wb-desc">${escHtml(w.description)}</span>
        <span class="wb-feels">Feels ${w.feelsLike}${w.unit} &nbsp;·&nbsp; ${w.tempMin}° – ${w.tempMax}°</span>
      </div>
    </div>
    <div class="wb-details">
      <div class="wb-chip">
        <span class="wb-chip-label">Humidity</span>
        <span class="wb-chip-value">${w.humidity}%</span>
      </div>
      <div class="wb-chip">
        <span class="wb-chip-label">Wind</span>
        <span class="wb-chip-value">${w.windSpeed} ${w.speedUnit} ${windDir(w.windDir)}</span>
      </div>
      <div class="wb-chip">
        <span class="wb-chip-label">Sunrise</span>
        <span class="wb-chip-value">${sunrise}</span>
      </div>
      <div class="wb-chip">
        <span class="wb-chip-label">Sunset</span>
        <span class="wb-chip-value">${sunset}</span>
      </div>
    </div>
    <div class="wb-forecast">${forecastHtml}</div>
  `;
}

setInterval(loadWeather, 10 * 60 * 1000);

// ───── Notes Ribbon ─────
async function loadNotes() {
  try {
    const res = await fetch('/api/notes');
    const data = await res.json();
    renderNotesRibbon(data.content || '');
  } catch (err) {
    console.error('[Notes]', err);
  }
}

function renderNotesRibbon(content) {
  notesText.classList.remove('scrolling');
  notesText.style.animationDuration = '';

  if (!content.trim()) {
    notesText.textContent = 'No notes yet — add some from your phone.';
    return;
  }

  const text = content.replace(/\n+/g, '     •     ').trim();
  notesText.textContent = text;

  requestAnimationFrame(() => {
    const trackWidth = notesRibbon.clientWidth;
    if (notesText.scrollWidth > trackWidth - 20) {
      const sep = '          •          ';
      notesText.textContent = text + sep + text;
      const duration = Math.max((notesText.scrollWidth / 2) / 80, 10);
      notesText.classList.add('scrolling');
      notesText.style.animationDuration = `${duration}s`;
    }
  });
}

setInterval(loadNotes, 60 * 1000);

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
        <p class="photo-placeholder-sub">Upload from your phone →</p>
      </div>
    `;
    if (photoCounter) photoCounter.style.display = 'none';
    stopPhotoAuto();
    return;
  }

  slideshow.innerHTML = photos.map((url, i) => `
    <img src="${escHtml(url)}" class="${i === currentPhoto ? 'visible' : ''}" alt="Photo ${i + 1}" loading="lazy" />
  `).join('');

  if (photoCounter) {
    photoCounter.style.display = 'block';
    updatePhotoCounter();
  }
  startPhotoAuto();
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

function stopPhotoAuto() { clearInterval(photoAutoTimer); }

setInterval(loadPhotos, 30 * 1000);

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
    img.style.cssText = 'width:88px;height:88px;border-radius:4px';
    qrBox.appendChild(img);
  } catch (err) {
    console.warn('[QR]', err.message);
  }
}

// ───── Setup modal ─────
document.getElementById('btnSetup').addEventListener('click', async () => {
  setupModal.style.display = 'flex';
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
  setupModal.style.display = 'none';
});

setupModal.addEventListener('click', e => {
  if (e.target === setupModal) setupModal.style.display = 'none';
});

// ───── Utils ─────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ───── Init ─────
loadStravaData();
loadWeather();
loadNotes();
loadPhotos();
initQR();
