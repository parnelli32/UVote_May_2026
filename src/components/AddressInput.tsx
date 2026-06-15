import { useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';

type AddressInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

export function AddressInput({ value, onChange, error, disabled }: AddressInputProps) {
  const { inputValue, setInputValue, predictions, selectPrediction, clearPredictions, isLoaded } =
    usePlacesAutocomplete();
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g., clear on reset)
  useEffect(() => {
    if (value === '') setInputValue('');
  }, [value, setInputValue]);

  function handleSelect(prediction: Parameters<typeof selectPrediction>[0]) {
    selectPrediction(prediction);
    onChange(prediction.structured_formatting.main_text);
  }

  function handleInput(v: string) {
    setInputValue(v);
    onChange(v);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        clearPredictions();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [clearPredictions]);

  return (
    <div ref={containerRef} className="relative">
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#374151', marginBottom: 5 }}>
        Street Address <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(Philadelphia, PA)</span>
      </label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInput(e.target.value)}
          disabled={disabled}
          placeholder={isLoaded ? 'Start typing your address…' : 'Enter your Philadelphia address'}
          className="focus:outline-none focus:ring-2 focus:ring-[#1B4332] w-full disabled:opacity-60"
          style={{ background: error ? '#FEF0EF' : '#F4F6F0', border: `1px solid ${error ? '#F0455A' : '#E2E8E4'}`, borderRadius: 8, padding: '10px 12px 10px 36px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box' }}
        />
      </div>
      {predictions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 overflow-hidden" style={{ background: 'white', border: '1px solid #E2E8E4', borderRadius: 12 }}>
          {predictions.map((p) => (
            <li key={p.place_id} style={{ borderBottom: '1px solid #F4F6F0' }} className="last:border-0">
              <button
                type="button"
                onMouseDown={() => handleSelect(p)}
                className="w-full text-left flex items-start gap-3 transition-colors group"
                style={{ padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#E8F0EB')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <i className="fa-solid fa-location-dot mt-0.5 shrink-0" style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f1724', lineHeight: 1.35 }}>
                    {p.structured_formatting.main_text}
                  </p>
                  <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.35 }}>
                    {p.structured_formatting.secondary_text}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isLoaded && (
        <p style={{ fontSize: 10, color: '#F5A623', marginTop: 3 }}>
          Address autocomplete unavailable. Enter your address manually.
        </p>
      )}
      {error && <p style={{ fontSize: 10, color: '#c0392b', marginTop: 3 }}>{error}</p>}
    </div>
  );
}
