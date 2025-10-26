/* eslint-disable @typescript-eslint/no-explicit-any */
export type Provider = 'nominatim' | 'google';

export interface GeocodeResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  raw: any;
  provider: Provider;
  placeId?: string;
}

export interface SearchOptions {
  provider?: Provider;
  signal?: AbortSignal;
  limit?: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_VIEWBOX = '-74.25,4.47,-73.99,4.90';

const GOOGLE_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const GOOGLE_BOUNDS = {
  south: 4.47,
  west: -74.25,
  north: 4.9,
  east: -73.99,
};

const DEFAULT_LIMIT = 5;

function resolveProvider(preferred?: Provider): Provider {
  if (preferred) {
    return preferred;
  }
  return import.meta.env.VITE_GOOGLE_KEY ? 'google' : 'nominatim';
}

function getNominatimEmail(): string {
  const email = import.meta.env.VITE_NOMINATIM_EMAIL;
  if (!email) {
    throw new Error('Falta configurar VITE_NOMINATIM_EMAIL para usar Nominatim.');
  }
  return email;
}

function buildUserAgent(email: string): string {
  return `GeoBogota/1.0 (${email})`;
}

function encodeQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function searchAddress(
  query: string,
  { provider: preferred, signal, limit = DEFAULT_LIMIT }: SearchOptions = {},
): Promise<GeocodeResult[]> {
  const provider = resolveProvider(preferred);
  if (!query.trim()) {
    return [];
  }

  if (provider === 'google') {
    return searchWithGoogle(query, { signal, limit });
  }
  return searchWithNominatim(query, { signal, limit });
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  { provider: preferred, signal }: { provider?: Provider; signal?: AbortSignal } = {},
): Promise<GeocodeResult | null> {
  const provider = resolveProvider(preferred);

  if (provider === 'google') {
    return reverseWithGoogle(lat, lng, signal);
  }
  return reverseWithNominatim(lat, lng, signal);
}

async function searchWithNominatim(
  query: string,
  { signal, limit }: { signal?: AbortSignal; limit: number },
): Promise<GeocodeResult[]> {
  const email = getNominatimEmail();
  const searchParams = encodeQuery({
    q: query,
    format: 'jsonv2',
    addressdetails: 1,
    limit,
    viewbox: NOMINATIM_VIEWBOX,
    bounded: 1,
    city: 'Bogotá',
    country: 'Colombia',
    dedupe: 1,
    polygon_geojson: 0,
    extratags: 0,
  });

  const response = await fetch(`${NOMINATIM_BASE}/search?${searchParams}`, {
    method: 'GET',
    signal,
    headers: {
      'User-Agent': buildUserAgent(email),
      'Accept-Language': 'es',
      ...(typeof window !== 'undefined' && window.location
        ? { Referer: window.location.origin }
        : {}),
      'From': email,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Se alcanzó el límite de consultas de Nominatim. Intenta más tarde.');
    }
    throw new Error('No se pudo buscar la dirección con Nominatim.');
  }

  const payload: any[] = await response.json();
  return payload.map((item) => ({
    id: item.place_id?.toString() ?? `${item.lat},${item.lon}`,
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    raw: item,
    provider: 'nominatim' as const,
  }));
}

async function reverseWithNominatim(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeocodeResult | null> {
  const email = getNominatimEmail();
  const searchParams = encodeQuery({
    lat,
    lon: lng,
    format: 'jsonv2',
    addressdetails: 1,
  });

  const response = await fetch(`${NOMINATIM_BASE}/reverse?${searchParams}`, {
    method: 'GET',
    signal,
    headers: {
      'User-Agent': buildUserAgent(email),
      'Accept-Language': 'es',
      ...(typeof window !== 'undefined' && window.location
        ? { Referer: window.location.origin }
        : {}),
      'From': email,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload: any = await response.json();
  if (!payload) {
    return null;
  }

  return {
    id: payload.place_id?.toString() ?? `${payload.lat},${payload.lon}`,
    label: payload.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    lat: Number(payload.lat ?? lat),
    lng: Number(payload.lon ?? lng),
    raw: payload,
    provider: 'nominatim',
  };
}

async function searchWithGoogle(
  query: string,
  { signal, limit }: { signal?: AbortSignal; limit: number },
): Promise<GeocodeResult[]> {
  const apiKey = import.meta.env.VITE_GOOGLE_KEY;
  if (!apiKey) {
    throw new Error('Falta configurar VITE_GOOGLE_KEY para usar Google Maps.');
  }

  const params = encodeQuery({
    input: query,
    language: 'es',
    types: 'geocode',
    key: apiKey,
    components: 'country:CO',
    locationbias: `rectangle:${GOOGLE_BOUNDS.south},${GOOGLE_BOUNDS.west}|${GOOGLE_BOUNDS.north},${GOOGLE_BOUNDS.east}`,
  });

  const autocompleteResponse = await fetch(`${GOOGLE_AUTOCOMPLETE_URL}?${params}`, {
    method: 'GET',
    signal,
  });

  if (!autocompleteResponse.ok) {
    throw new Error('No se pudo obtener sugerencias de Google Places.');
  }

  const autocompletePayload: any = await autocompleteResponse.json();

  if (autocompletePayload.status !== 'OK' && autocompletePayload.status !== 'ZERO_RESULTS') {
    throw new Error(googleStatusMessage(autocompletePayload.status));
  }

  const predictions: any[] = autocompletePayload.predictions ?? [];
  if (!predictions.length) {
    return [];
  }

  const sliced = predictions.slice(0, limit);
  const geocodePromises = sliced.map(async (prediction) => {
    const placeId: string = prediction.place_id;
    const detailParams = encodeQuery({ place_id: placeId, key: apiKey });
    const geocodeResponse = await fetch(`${GOOGLE_GEOCODE_URL}?${detailParams}`, { method: 'GET', signal });
    if (!geocodeResponse.ok) {
      throw new Error('No se pudo geocodificar la dirección seleccionada.');
    }
    const geocodePayload: any = await geocodeResponse.json();
    if (geocodePayload.status !== 'OK' || !geocodePayload.results?.length) {
      throw new Error(googleStatusMessage(geocodePayload.status));
    }
    const result = geocodePayload.results[0];
    return {
      id: placeId,
      label: prediction.description,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      raw: result,
      provider: 'google' as const,
      placeId,
    } satisfies GeocodeResult;
  });

  return Promise.all(geocodePromises);
}

async function reverseWithGoogle(lat: number, lng: number, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_KEY;
  if (!apiKey) {
    throw new Error('Falta configurar VITE_GOOGLE_KEY para usar Google Maps.');
  }

  const params = encodeQuery({ latlng: `${lat},${lng}`, key: apiKey, language: 'es' });
  const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params}`, { method: 'GET', signal });
  if (!response.ok) {
    return null;
  }
  const payload: any = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) {
    return null;
  }
  const result = payload.results[0];
  return {
    id: result.place_id ?? `${lat},${lng}`,
    label: result.formatted_address,
    lat,
    lng,
    raw: result,
    provider: 'google',
    placeId: result.place_id,
  };
}

function googleStatusMessage(status?: string): string {
  switch (status) {
    case 'ZERO_RESULTS':
      return 'No se encontraron resultados en Google para esa búsqueda.';
    case 'OVER_QUERY_LIMIT':
      return 'Se alcanzó el límite de cuota de Google Maps.';
    case 'REQUEST_DENIED':
      return 'La API de Google Maps rechazó la solicitud. Revisa la clave y restricciones.';
    case 'INVALID_REQUEST':
      return 'Solicitud inválida enviada a Google Maps.';
    case 'UNKNOWN_ERROR':
      return 'Error desconocido en la API de Google Maps. Intenta de nuevo.';
    default:
      return 'No se pudo completar la petición con Google Maps.';
  }
}

