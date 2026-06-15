import { useState, useEffect, useRef, useCallback } from 'react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

type Prediction = {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
};

type UsePlacesAutocompleteReturn = {
  inputValue: string;
  setInputValue: (v: string) => void;
  predictions: Prediction[];
  selectPrediction: (prediction: Prediction) => void;
  clearPredictions: () => void;
  isLoaded: boolean;
};

export function usePlacesAutocomplete(): UsePlacesAutocompleteReturn {
  const [inputValue, setInputValueState] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setIsLoaded(false);
      return;
    }

    if (window.google?.maps?.places) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      setIsLoaded(true);
      return;
    }

    const scriptId = 'google-maps-places';
    if (document.getElementById(scriptId)) {
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          autocompleteService.current = new window.google.maps.places.AutocompleteService();
          setIsLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      setIsLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  const fetchPredictions = useCallback((value: string) => {
    if (!autocompleteService.current || value.length < 3) {
      setPredictions([]);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: 'us' },
        location: new window.google.maps.LatLng(39.9526, -75.1652),
        radius: 25000,
        types: ['address'],
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          // Filter to Philadelphia addresses
          const phillyResults = results.filter((r) =>
            r.description.toLowerCase().includes('philadelphia')
          );
          setPredictions(phillyResults.length > 0 ? phillyResults : results.slice(0, 5));
        } else {
          setPredictions([]);
        }
      }
    );
  }, []);

  const setInputValue = useCallback(
    (value: string) => {
      setInputValueState(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchPredictions(value), 300);
    },
    [fetchPredictions]
  );

  const selectPrediction = useCallback((prediction: Prediction) => {
    setInputValueState(prediction.structured_formatting.main_text);
    setPredictions([]);
  }, []);

  const clearPredictions = useCallback(() => setPredictions([]), []);

  return { inputValue, setInputValue, predictions, selectPrediction, clearPredictions, isLoaded };
}
