import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './GeoBogota.css';
import { GeocodeResult, Provider, searchAddress } from '../lib/geocode';

interface GeoBogotaProps {
  provider?: Provider;
  initialAddress?: string;
}

interface StatusMessage {
  type: 'error' | 'info';
  text: string;
}

const DEBOUNCE_MS = 350;

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

const GeoBogota: React.FC<GeoBogotaProps> = ({ provider, initialAddress }) => {
  const [query, setQuery] = useState(initialAddress ?? '');
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedResult, setSelectedResult] = useState<GeocodeResult | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number>();
  const mountedRef = useRef(false);

  const resolvedProvider = useMemo<Provider>(() => {
    if (provider) {
      return provider;
    }
    return (import.meta.env.VITE_GOOGLE_KEY ? 'google' : 'nominatim') as Provider;
  }, [provider]);

  const fetchSuggestions = useCallback(
    async (value: string) => {
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
        if (!mountedRef.current) {
          return;
        }

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
    },
    [resolvedProvider],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
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
      if (!mountedRef.current) {
        return;
      }

      if (!results.length) {
        setStatus({
          type: 'info',
          text: 'No se encontraron resultados para esa dirección en Bogotá.',
        });
        setSelectedResult(null);
        setSuggestions([]);
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

  const handleCopy = async () => {
    if (!selectedResult) {
      return;
    }
    const value = `${formatCoordinate(selectedResult.lat)},${formatCoordinate(selectedResult.lng)}`;
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

      <div className="result-panel" aria-live="polite">
        <h2>Resultados</h2>
        {selectedResult ? (
          <div className="coordinates">
            <p>
              <strong>Lat:</strong> {formatCoordinate(selectedResult.lat)}
            </p>
            <p>
              <strong>Lng:</strong> {formatCoordinate(selectedResult.lng)}
            </p>
            <button type="button" onClick={handleCopy} className="copy-button">
              Copiar
            </button>
          </div>
        ) : (
          <p>Selecciona una dirección para ver sus coordenadas.</p>
        )}
        {selectedResult && (
          <p className="selected-address">
            <strong>Dirección:</strong> {selectedResult.label}
          </p>
        )}
      </div>

      <p className="data-source">Datos de geocodificación © OpenStreetMap</p>
    </section>
  );
};

export default GeoBogota;
