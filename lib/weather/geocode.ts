export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  countryCode: string | null;
}

/** Free, keyless geocoding via Open-Meteo. Good enough for city/address-level lookups. */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", address);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding request failed (${res.status})`);
  }

  const data = await res.json();
  const first = data?.results?.[0];

  if (!first) {
    throw new Error(`Could not find a location matching "${address}". Try a nearby city name.`);
  }

  return {
    lat: first.latitude,
    lon: first.longitude,
    displayName: [first.name, first.admin1, first.country].filter(Boolean).join(", "),
    countryCode: first.country_code ?? null,
  };
}
