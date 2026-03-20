# Home Dashboard

A full-screen dashboard for your Raspberry Pi 5 showing Strava activities, weather, a notes board, a weekly leaderboard, and a photo slideshow — all in a dark, TV-friendly UI.

---

## Features

| Section | Description |
|---|---|
| **Activities** | Last 20+ combined activities for all athletes; filterable by Run/Ride |
| **Leaderboard** | Weekly running miles + cycling miles per athlete with animated bars |
| **Weather** | Current conditions + 24h forecast via OpenWeatherMap |
| **Notes** | Shared household notepad, auto-saves with 2s debounce |
| **Photos** | Slideshow of uploaded images, auto-advances every 8 seconds |

Strava data refreshes automatically every **15 minutes** server-side.

---

## Prerequisites

- **Node.js 18+** — `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs`
- A **Strava API application** (free) — create at https://www.strava.com/settings/api
  - Set "Authorization Callback Domain" to `localhost`
- An **OpenWeatherMap API key** (free tier) — https://openweathermap.org/api

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

Fill in:

```env
STRAVA_CLIENT_ID=123456
STRAVA_CLIENT_SECRET=abc123...
STRAVA_ATHLETE_IDS=11111111,22222222,33333333
STRAVA_ATHLETE_NAMES=Alice,Bob,Carol

WEATHER_API_KEY=your_owm_key
WEATHER_CITY=Denver
WEATHER_COUNTRY=US
WEATHER_UNITS=imperial    # imperial (°F/mph) or metric (°C/m/s)

PORT=3000
```

### 3. Start the server

```bash
npm start
```

Open **http://localhost:3000** in Chromium.

### 4. Connect Strava accounts

Each athlete must authorize the app **once**:

1. Open **http://localhost:3000** and click ⚙ (Setup)
2. Click **"Connect Strava →"** for each athlete — this opens Strava's OAuth page
3. The athlete logs in and clicks "Authorize"
4. Tokens are saved to `tokens.json` automatically

> **Note:** The Strava API only lets an app read the *authorized athlete's own* activities. Each roommate must complete the OAuth flow using their own Strava account.

---

## Running on Boot (Raspberry Pi)

### Autostart the server

Create a systemd service:

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

Edit the autostart file:

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

Or add to `/etc/xdg/lxsession/LXDE-pi/autostart`:

```
@chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:3000
```

---

## Adding Photos

- Click ⚙ Setup → the Photos section has an upload button
- Or drop images directly into `public/photos/` on the Pi
- Supported formats: JPEG, PNG, GIF, WebP, AVIF

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `→` / `↓` | Next section |
| `←` / `↑` | Previous section |
| `Space` | Toggle auto-cycle |
| `R` | Refresh Strava data |

---

## Architecture

```
home-dashboard/
├── server/
│   ├── index.js          # Express app + cron job
│   ├── cache/
│   │   └── stravaCache.js  # token mgmt + data fetch + leaderboard
│   └── routes/
│       ├── strava.js     # /api/strava/*
│       ├── weather.js    # /api/weather
│       ├── notes.js      # /api/notes
│       └── photos.js     # /api/photos
├── public/
│   ├── index.html        # Single-page dashboard
│   ├── css/dashboard.css
│   ├── js/dashboard.js
│   └── photos/           # Uploaded images (gitignored)
├── .env                  # Secrets (gitignored)
├── tokens.json           # Strava OAuth tokens (gitignored)
└── notes.txt             # Household notes (gitignored)
```
