/**
 * Free, keyless climate data via Open-Meteo (https://open-meteo.com). Good enough to ground
 * the AI's risk assessment in real numbers for an MVP. Swap/augment with NASA POWER or a paid
 * provider (e.g. Tomorrow.io, ClimateAi) for production-grade precision later.
 */

interface DailyForecast {
  dates: string[];
  tempMaxC: number[];
  precipitationMm: number[];
  windGustsKmh: number[];
}

interface HistoricalExtremes {
  yearsAnalyzed: number;
  daysAbove35C: number;
  daysAbove38C: number;
  maxDailyPrecipitationMm: number;
  daysWithHeavyRain: number; // > 50mm in a day
  maxWindGustKmh: number;
}

export interface ClimateSnapshot {
  elevationMeters: number | null;
  forecast: DailyForecast;
  historicalExtremes: HistoricalExtremes;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API request failed (${res.status}): ${url}`);
  }
  return res.json();
}

async function getElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
    );
    return data?.elevation?.[0] ?? null;
  } catch {
    return null;
  }
}

async function getForecast(lat: number, lon: number): Promise<DailyForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,precipitation_sum,wind_gusts_10m_max&forecast_days=14&timezone=auto`;

  const data = await fetchJson(url);

  return {
    dates: data.daily.time,
    tempMaxC: data.daily.temperature_2m_max,
    precipitationMm: data.daily.precipitation_sum,
    windGustsKmh: data.daily.wind_gusts_10m_max,
  };
}

async function getHistoricalExtremes(lat: number, lon: number): Promise<HistoricalExtremes> {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 5); // archive API lags a few days
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 5);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}` +
    `&daily=temperature_2m_max,precipitation_sum,wind_gusts_10m_max&timezone=auto`;

  const data = await fetchJson(url);

  const tempMax: number[] = data.daily.temperature_2m_max ?? [];
  const precip: number[] = data.daily.precipitation_sum ?? [];
  const gusts: number[] = data.daily.wind_gusts_10m_max ?? [];

  return {
    yearsAnalyzed: 5,
    daysAbove35C: tempMax.filter((t) => t >= 35).length,
    daysAbove38C: tempMax.filter((t) => t >= 38).length,
    maxDailyPrecipitationMm: precip.length ? Math.max(...precip) : 0,
    daysWithHeavyRain: precip.filter((p) => p >= 50).length,
    maxWindGustKmh: gusts.length ? Math.max(...gusts) : 0,
  };
}

export async function getClimateSnapshot(lat: number, lon: number): Promise<ClimateSnapshot> {
  const [elevationMeters, forecast, historicalExtremes] = await Promise.all([
    getElevation(lat, lon),
    getForecast(lat, lon),
    getHistoricalExtremes(lat, lon),
  ]);

  return { elevationMeters, forecast, historicalExtremes };
}
