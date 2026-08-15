export type AisResult =
  | { success: true; councilDistrict: string; lat: number | null; lng: number | null }
  | { success: false; error: string };

export async function lookupAddressDistrict(address: string): Promise<AisResult> {
  const encoded = encodeURIComponent(address);
  const url = `https://api.phila.gov/ais/v1/addresses/${encoded}`;

  const response = await fetch(url);

  if (!response.ok) {
    return {
      success: false,
      error: `AIS API returned status ${response.status}`,
    };
  }

  const json = await response.json();
  const councilDistrict: string | null | undefined =
    json?.features?.[0]?.properties?.council_district_2016;

  if (!councilDistrict) {
    return {
      success: false,
      error: 'council_district_2016 not found',
    };
  }

  // AIS's response is GeoJSON and already carries [lng, lat] under
  // features[0].geometry.coordinates — reused here for PA House/Senate
  // point-in-polygon resolution (see resolve_user_state_districts) instead
  // of adding a second, paid geocoding dependency (e.g. Google Places
  // Details) that Places Autocomplete alone does not provide.
  const coordinates: [number, number] | null | undefined =
    json?.features?.[0]?.geometry?.coordinates;
  const [lng, lat] = coordinates ?? [null, null];

  return { success: true, councilDistrict, lat: lat ?? null, lng: lng ?? null };
}
