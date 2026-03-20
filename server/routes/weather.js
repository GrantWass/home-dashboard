const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.WEATHER_API_KEY;
const CITY = process.env.WEATHER_CITY || 'New York';
const COUNTRY = process.env.WEATHER_COUNTRY || 'US';
const UNITS = process.env.WEATHER_UNITS || 'imperial';

let weatherCache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// GET /api/weather
router.get('/', async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'WEATHER_API_KEY not configured' });
  }

  const now = Date.now();
  if (weatherCache && now - cacheTime < CACHE_TTL_MS) {
    return res.json(weatherCache);
  }

  try {
    const [currentRes, forecastRes] = await Promise.all([
      axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: `${CITY},${COUNTRY}`, appid: API_KEY, units: UNITS },
      }),
      axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: { q: `${CITY},${COUNTRY}`, appid: API_KEY, units: UNITS, cnt: 8 },
      }),
    ]);

    const c = currentRes.data;
    const unit = UNITS === 'imperial' ? '°F' : UNITS === 'metric' ? '°C' : 'K';
    const speedUnit = UNITS === 'imperial' ? 'mph' : 'm/s';
    const windSpeed = UNITS === 'imperial'
      ? Math.round(c.wind.speed)
      : Math.round(c.wind.speed);

    weatherCache = {
      city: c.name,
      country: c.sys.country,
      temp: Math.round(c.main.temp),
      feelsLike: Math.round(c.main.feels_like),
      tempMin: Math.round(c.main.temp_min),
      tempMax: Math.round(c.main.temp_max),
      humidity: c.main.humidity,
      description: c.weather[0].description,
      icon: c.weather[0].icon,
      windSpeed,
      windDir: c.wind.deg,
      unit,
      speedUnit,
      sunrise: c.sys.sunrise,
      sunset: c.sys.sunset,
      forecast: forecastRes.data.list.map(f => ({
        time: f.dt,
        temp: Math.round(f.main.temp),
        description: f.weather[0].description,
        icon: f.weather[0].icon,
      })),
      fetchedAt: new Date().toISOString(),
    };
    cacheTime = now;
    res.json(weatherCache);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Weather]', msg);
    if (weatherCache) return res.json(weatherCache); // serve stale on error
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
