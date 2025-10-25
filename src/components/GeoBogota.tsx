import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import L, { LeafletEventHandlerFnMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import './GeoBogota.css';
import {
  BOGOTA_BOUNDS,
  BOGOTA_CENTER,
  GeocodeResult,
  Provider,
  reverseGeocode,
  searchAddress,
} from '../lib/geocode';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

interface GeoBogotaProps {
  provider?: Provider;
  initialAddress?: string;
}

interface StatusMessage {
  type: 'error' | 'info';
  text: string;
}

const DEFAULT_ZOOM = 12;
const FOCUSED_ZOOM = 16;
const DEBOUNCE_MS = 350;

function MapViewUpdater({ position }: { position: L.LatLngExpression | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), FOCUSED_ZOOM), {
        duration: 0.8,
      });
    }
  }, [map, position]);

  return null;
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

const GeoBogota: React.FC<GeoBogotaProps> = ({ provider, initialAddress }) => {
  const [query, setQuery] = useState(initialAddress ?? '');
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedResult, setSelectedResult] = useState<GeocodeResult | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [markerPosition, setMarkerPosition] = useState<L.LatLngLiteral | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>();
  const mountedRef = useRef(false);

  const resolvedProvider = useMemo<Provider>(() => {
    if (provider) {
      return provider;
    }
    return (import.meta.env.VITE_GOOGLE_KEY ? 'google' : 'nominatim') as Provider;
  }, [provider]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setStatus(null);
      return () => {
        window.clearTimeout(debounceRef.current);
      };
    }

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(query);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceRef.current);
    };
  }, [fetchSuggestions, query]);

  useEffect(() => {
    if (selectedResult) {
      setMarkerPosition({ lat: selectedResult.lat, lng: selectedResult.lng });
    }
  }, [selectedResult]);

  const fetchSuggestions = useCallback(async (value: string) => {
    searchAbortRef.current?.abort();
    if (!value.trim()) {
      setSuggestions([]);
      setStatus(null);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsLoadingSuggestions(true);

    try {
      const results = await searchAddress(value, {
        provider: resolvedProvider,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;

      setSuggestions(results);
      if (!results.length) {
        setStatus({ type: 'info', text: 'No se encontraron coincidencias.' });
      } else {
        setStatus(null);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      setStatus({
        type: 'error',
        text:
          (error as Error).message ||
          'Ocurrió un error al obtener sugerencias. Verifica tu conexión.',
      });
    } finally {
      if (mountedRef.current) {
        setIsLoadingSuggestions(false);
      }
    }
  }, [resolvedProvider]);

  const handleSuggestionClick = (result: GeocodeResult) => {
    setSelectedResult(result);
    setQuery(result.label);
    setSuggestions([]);
    setStatus(null);
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    searchAbortRef.current?.abort();

    if (!query.trim()) {
      setStatus({ type: 'info', text: 'Escribe una dirección antes de buscar.' });
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);

    try {
      const results = await searchAddress(query, {
        provider: resolvedProvider,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;

      if (!results.length) {
        setStatus({
          type: 'info',
          text: 'No se encontraron resultados para esa dirección en Bogotá.',
        });
        return;
      }
      setSelectedResult(results[0]);
      setQuery(results[0].label);
      setSuggestions(results);
      setStatus(null);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      setStatus({
        type: 'error',
        text:
          (error as Error).message ||
          'No se pudo completar la búsqueda. Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      if (mountedRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleMarkerDragEnd = useCallback(
    async (event: L.LeafletEvent) => {
      const target = event.target as L.Marker;
      const position = target.getLatLng();
      setMarkerPosition(position);

      reverseAbortRef.current?.abort();
      const controller = new AbortController();
      reverseAbortRef.current = controller;

      try {
        const result = await reverseGeocode(position.lat, position.lng, {
          provider: resolvedProvider,
          signal: controller.signal,
        });
        if (!result || !mountedRef.current) {
          return;
        }
        setSelectedResult(result);
        setQuery(result.label);
        setStatus({ type: 'info', text: 'Dirección actualizada según la posición del marcador.' });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setStatus({
          type: 'error',
          text:
            (error as Error).message ||
            'No se pudo obtener la dirección del punto seleccionado.',
        });
      }
    },
    [resolvedProvider],
  );

  const markerEventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      dragend: (event) => {
        void handleMarkerDragEnd(event as unknown as L.LeafletEvent);
      },
    }),
    [handleMarkerDragEnd],
  );

  const handleCopy = async () => {
    if (!markerPosition) {
      return;
    }
    const value = `${formatCoordinate(markerPosition.lat)},${formatCoordinate(markerPosition.lng)}`;
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ type: 'info', text: 'Coordenadas copiadas al portapapeles.' });
    } catch (error) {
      setStatus({
        type: 'error',
        text:
          (error as Error).message || 'No se pudieron copiar las coordenadas. Copia manualmente.',
      });
    }
  };

  const renderStatus = () => {
    if (!status) {
      return null;
    }
    return (
      <div
        role="status"
        aria-live={status.type === 'error' ? 'assertive' : 'polite'}
        className={`status-message status-${status.type}`}
      >
        {status.text}
      </div>
    );
  };

  return (
    <section className="geo-bogota">
      <form className="search-form" onSubmit={handleSearch} aria-label="Buscar direcciones en Bogotá">
        <label className="search-label" htmlFor="geo-bogota-input">
          Dirección
        </label>
        <div className="search-controls">
          <input
            id="geo-bogota-input"
            type="text"
            placeholder="Escribe una dirección en Bogotá (ej. 'Cra 7 # 72-41')"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls="geo-bogota-suggestions"
            aria-describedby="geo-bogota-helper"
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <span id="geo-bogota-helper" className="visually-hidden">
          Empieza a escribir para ver sugerencias de direcciones en Bogotá.
        </span>
        {isLoadingSuggestions && <div className="loading">Buscando sugerencias…</div>}
        {suggestions.length > 0 && (
          <ul className="suggestions" id="geo-bogota-suggestions" role="listbox">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className="suggestion-item"
                  role="option"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {renderStatus()}

      <div className="map-wrapper" role="region" aria-label="Mapa de Bogotá con marcador de ubicación">
        <MapContainer
          center={BOGOTA_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '420px', width: '100%' }}
          zoomControl={false}
          bounds={L.latLngBounds(BOGOTA_BOUNDS.southWest, BOGOTA_BOUNDS.northEast)}
          maxBounds={L.latLngBounds(BOGOTA_BOUNDS.southWest, BOGOTA_BOUNDS.northEast)}
          maxBoundsViscosity={0.8}
          minZoom={11}
        >
          <TileLayer
            attribution="&copy; <a href='https://www.openstreetmap.org/'>OpenStreetMap</a> colaboradores"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="topright" />
          {markerPosition && (
            <Marker position={markerPosition} draggable eventHandlers={markerEventHandlers} />
          )}
          <MapViewUpdater position={markerPosition ? [markerPosition.lat, markerPosition.lng] : null} />
        </MapContainer>
      </div>

      <div className="result-panel">
        <h2>Resultados</h2>
        {markerPosition ? (
          <div className="coordinates">
            <p>
              <strong>Lat:</strong> {formatCoordinate(markerPosition.lat)}
            </p>
            <p>
              <strong>Lng:</strong> {formatCoordinate(markerPosition.lng)}
            </p>
            <button type="button" onClick={handleCopy} className="copy-button">
              Copiar
            </button>
          </div>
        ) : (
          <p>Selecciona una dirección para ver sus coordenadas.</p>
        )}
        {selectedResult && (
          <p className="selected-address" aria-live="polite">
            <strong>Dirección:</strong> {selectedResult.label}
          </p>
        )}
      </div>

      <p className="data-source">Datos de mapas © OpenStreetMap</p>
    </section>
  );
};

export default GeoBogota;
