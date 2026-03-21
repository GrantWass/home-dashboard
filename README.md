# Home Dashboard

A single-page ambient display for a Raspberry Pi 5 in the kitchen. Shows Strava activities with route maps, weather across the top, a weekly leaderboard, a photo slideshow, and a scrolling notes ribbon — all on one screen, no interaction needed.

---

## What's on screen

- **Weather bar** — current temp, conditions, humidity, wind, sunrise/sunset, hourly forecast chips
- **Photo slideshow** — full-height, auto-cycles every 8 seconds
- **Activities** — last 2 per athlete, with route map watermark, stats, and HR
- **Leaderboard** — weekly running and cycling miles with ranked bars
- **Notes ribbon** — scrolling ticker at the bottom, editable from any phone via QR code

Strava data refreshes every **15 minutes** server-side.

---

## Prerequisites

- **Node.js 18+**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt install -y nodejs
  ```
- **A Strava API app per athlete** (free) — each person creates their own at https://www.strava.com/settings/api
  - Set "Authorization Callback Domain" to your Pi's local IP (e.g. `192.168.1.100`)
- **OpenWeatherMap API key** (free tier) — https://openweathermap.org/api

> **Why per-athlete apps?** Strava's development tier only allows the app creator to authorize. Each roommate creates their own free app (takes 2 minutes) and shares their Client ID + Secret with you.

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url> home-dashboard
cd home-dashboard
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

```env
# One block per athlete — each person creates their own Strava API app
STRAVA_ATHLETE_0_NAME=Grant
STRAVA_ATHLETE_0_CLIENT_ID=214365
STRAVA_ATHLETE_0_CLIENT_SECRET=abc123...

STRAVA_ATHLETE_1_NAME=Sam
STRAVA_ATHLETE_1_CLIENT_ID=219999
STRAVA_ATHLETE_1_CLIENT_SECRET=def456...

# Add STRAVA_ATHLETE_2_*, STRAVA_ATHLETE_3_*, etc. for more roommates

WEATHER_API_KEY=your_owm_key
WEATHER_CITY=Lincoln
WEATHER_COUNTRY=US
WEATHER_UNITS=imperial    # imperial (°F/mph) or metric (°C/m/s)

PORT=3000
```

### 3. Start the server

```bash
npm run dev   # development (auto-restarts on changes)
npm start     # production
```

### 4. Connect Strava accounts

On startup the server prints auth URLs for anyone not yet connected:

```
[STRAVA] Auth needed for 3 athlete(s):
  Sam:     http://192.168.1.100:3000/api/strava/auth/1
  Rico:    http://192.168.1.100:3000/api/strava/auth/2
  Matthew: http://192.168.1.100:3000/api/strava/auth/3
```

Each athlete opens their link on their phone (must be on the same WiFi) and logs in with **their own** Strava account. Tokens are saved to `tokens.json` automatically. Once connected, the URL won't appear again on restart.

---

## Running on Boot (Raspberry Pi)

### Autostart the server

```bash
sudo nano /etc/systemd/system/dashboard.service
```

```ini
[Unit]
Description=Home Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/home-dashboard/server/index.js
WorkingDirectory=/home/pi/home-dashboard
Restart=always
User=pi
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

### Autostart Chromium in kiosk mode

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/dashboard.desktop
```

```ini
[Desktop Entry]
Type=Application
Name=Dashboard
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito http://localhost:3000
```

---

## Mobile companion

Scan the QR code on the dashboard (bottom-left corner) or visit `http://<pi-ip>:3000/mobile` on any phone on the same WiFi to:

- Edit the shared notes (updates the ribbon in real time)
- Upload photos from your camera roll or take a new one

---

## Photos

- Upload via the mobile companion page
- Or drop files directly into `public/photos/` on the Pi
- Supported formats: JPEG, PNG, GIF, WebP, AVIF
- Max 20 MB per file

---

## Architecture

```
home-dashboard/
├── server/
│   ├── index.js              # Express app + cron + startup auth hints
│   ├── cache/
│   │   └── stravaCache.js    # per-athlete token mgmt, data fetch, leaderboard
│   └── routes/
│       ├── strava.js         # /api/strava/* (OAuth + data)
│       ├── weather.js        # /api/weather
│       ├── notes.js          # /api/notes
│       └── photos.js         # /api/photos
├── public/
│   ├── index.html            # Single-page kiosk dashboard
│   ├── mobile.html           # Phone companion (notes + photos)
│   ├── css/dashboard.css
│   ├── js/dashboard.js
│   └── photos/               # Uploaded images (gitignored)
├── .env                      # Secrets (gitignored)
├── tokens.json               # Strava OAuth tokens (gitignored)
└── notes.txt                 # Household notes (gitignored)
```
