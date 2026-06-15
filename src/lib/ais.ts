export type AisResult =
  | { success: true; councilDistrict: string }
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

  return { success: true, councilDistrict };
}
