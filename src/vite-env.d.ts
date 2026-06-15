/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal Google Maps Places type augmentation
declare namespace google {
  namespace maps {
    class LatLng {
      constructor(lat: number, lng: number);
    }
    namespace places {
      class AutocompleteService {
        getPlacePredictions(
          request: {
            input: string;
            componentRestrictions?: { country: string };
            location?: google.maps.LatLng;
            radius?: number;
            types?: string[];
          },
          callback: (
            results: Array<{
              place_id: string;
              description: string;
              structured_formatting: {
                main_text: string;
                secondary_text: string;
              };
            }> | null,
            status: string
          ) => void
        ): void;
      }
      const PlacesServiceStatus: {
        OK: string;
      };
    }
  }
}
