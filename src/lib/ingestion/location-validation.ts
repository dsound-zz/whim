import { geocodeWithMapbox } from '@/lib/utils/geocode';

// Known generic centroids that we want to reject
export const GENERIC_CENTROIDS = [
  { lat: 40.664017, lng: -73.88818, name: 'Payne/East NY' },
  { lat: 40.712749, lng: -74.005994, name: 'Generic NYC' },
  { lat: 40.6526, lng: -73.9497, name: 'Generic Brooklyn' },
  { lat: 40.789352, lng: -73.95709, name: 'Generic Manhattan' },
  { lat: 40.7135, lng: -73.8283, name: 'Generic Queens' },
  { lat: 40.847, lng: -73.8972, name: 'Generic Bronx' },
  { lat: 40.58337, lng: -74.149643, name: 'Generic Staten Island' },
];

/**
 * NYC bounding box. Any geocoded coordinate outside this range is not in New York City.
 * Format: [minLng, minLat, maxLng, maxLat] (Mapbox bbox parameter order)
 */
export const NYC_BOUNDING_BOX = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLng: -74.2591,
  maxLng: -73.7004,
  mapboxParam: '-74.2591,40.4774,-73.7004,40.9176',
};

/**
 * Returns true if the coordinate is within the NYC bounding box.
 */
export function isWithinNYC(lat: number, lng: number): boolean {
  return (
    lat >= NYC_BOUNDING_BOX.minLat &&
    lat <= NYC_BOUNDING_BOX.maxLat &&
    lng >= NYC_BOUNDING_BOX.minLng &&
    lng <= NYC_BOUNDING_BOX.maxLng
  );
}

/**
 * Checks if a given lat/lng closely matches any of the known generic centroids.
 * We use a small epsilon (e.g., 0.005) to account for floating-point or slight variations.
 * Also rejects coordinates that fall outside the NYC bounding box.
 */
export function isValidLocation(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;

  // Reject coordinates outside NYC entirely
  if (!isWithinNYC(lat, lng)) {
    return false;
  }

  const EPSILON = 0.005; // ~500 meters
  for (const centroid of GENERIC_CENTROIDS) {
    if (Math.abs(lat - centroid.lat) < EPSILON && Math.abs(lng - centroid.lng) < EPSILON) {
      return false; // Matched a generic centroid, so it's NOT valid
    }
  }

  return true; // Valid coordinates
}

/**
 * Evaluates an address string to detect if it is highly generic (e.g. a bare city name
 * without any street-level specificity).
 *
 * Previously this function flagged any address without a leading street number as generic,
 * which caused false positives on landmarks (Central Park, Madison Square Garden) and
 * addresses with ZIP codes. The new logic:
 * 1. Known generic patterns (bare city/state) → always generic
 * 2. Has a street suffix (St, Ave, Rd, etc.) or ZIP code → NOT generic
 * 3. Very short (< 15 chars) without a street suffix → generic
 * 4. Everything else → not generic (err on the side of keeping data)
 */
export function isGenericAddress(address: string | null | undefined): boolean {
  if (!address) return true;

  const trimmed = address.trim();
  if (trimmed.length === 0) return true;

  // Known generic patterns: bare city/state/country strings
  const genericPatterns = [
    /^brooklyn,\s*ny(,\s*us)?$/i,
    /^new\s*york\s*\(nyc\),\s*ny(,\s*us)?$/i,
    /^new\s*york,\s*ny(,\s*us)?$/i,
    /^manhattan,\s*ny(,\s*us)?$/i,
    /^bronx,\s*ny(,\s*us)?$/i,
    /^queens,\s*ny(,\s*us)?$/i,
    /^staten\s*island,\s*ny(,\s*us)?$/i,
    /^nyc(,\s*ny)?(,\s*us)?$/i,
    /^united\s*states$/i,
    /^us$/i,
  ];

  if (genericPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // If it contains a recognizable street suffix → specific enough
  const hasStreetSuffix = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|pl|place|dr|drive|way|pkwy|parkway|ct|court|ter|terrace|cir|circle|hwy|highway|expy|expressway)\b/i.test(trimmed);
  if (hasStreetSuffix) return false;

  // If it contains a US ZIP code → specific enough
  const hasZipCode = /\b\d{5}(-\d{4})?\b/.test(trimmed);
  if (hasZipCode) return false;

  // If it starts with a street number → likely specific
  const hasStreetNumber = /^\d+/.test(trimmed);
  if (hasStreetNumber) return false;

  // Short strings without any of the above signals are likely generic
  if (trimmed.length < 15) return true;

  // Default: err on the side of not flagging
  return false;
}

/**
 * Returns true if the address string explicitly references a municipality
 * that is outside the NYC 5 boroughs (Long Island suburbs, Westchester,
 * New Jersey, Connecticut, etc.).
 *
 * This catches cases where a scraper provides a fully-qualified address like
 * "Paramount, Huntington, NY" and we would otherwise force-geocode it within
 * the NYC bounding box, matching a street named Huntington inside the city.
 *
 * Note: This is intentionally conservative — it only flags clearly out-of-area
 * places, not ambiguous strings. False-negative (missing a suburb) is safer
 * than false-positive (rejecting a valid NYC address).
 */
export function isOutsideNYCMunicipality(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();

  // Long Island — Nassau County cities/towns
  const nassauPlaces = [
    'hempstead', 'garden city', 'mineola', 'great neck', 'long beach',
    'rockville centre', 'valley stream', 'freeport', 'oceanside',
    'lynbrook', 'elmont', 'floral park', 'new hyde park', 'manhasset',
    'port washington', 'glen cove', 'oyster bay', 'hicksville',
    'levittown', 'wantagh', 'massapequa', 'merrick', 'bellmore',
    'east meadow', 'uniondale', 'roosevelt', 'inwood', 'woodmere',
  ];

  // Long Island — Suffolk County cities/towns
  const suffolkPlaces = [
    'huntington', 'babylon', 'islip', 'smithtown', 'brookhaven',
    'riverhead', 'southampton', 'east hampton', 'shelter island',
    'southold', 'central islip', 'brentwood', 'bay shore', 'amityville',
    'lindenhurst', 'west babylon', 'copiague', 'deer park', 'north babylon',
    'commack', 'hauppauge', 'ronkonkoma', 'bohemia', 'holbrook',
    'patchogue', 'coram', 'medford', 'centereach', 'stony brook',
    'port jefferson', 'setauket', 'miller place', 'rocky point',
    'sound beach', 'farmingville', 'selden', 'lake grove', 'lake ronkonkoma',
    'shirley', 'mastic', 'mastic beach', 'bellport', 'east patchogue',
    'sayville', 'west sayville', 'oakdale', 'bohemia', 'great river',
    'bay shore', 'brightwaters', 'west islip', 'east islip', 'islip terrace',
    'east brentwood', 'north amityville', 'north lindenhurst',
    'melville', 'south huntington', 'east northport', 'cold spring harbor',
    'dix hills', 'half hollow hills', 'wheatley heights', 'wyandanch',
  ];

  // Westchester County
  const westchesterPlaces = [
    'yonkers', 'new rochelle', 'mount vernon', 'white plains',
    'port chester', 'scarsdale', 'harrison', 'rye', 'mamaroneck',
    'larchmont', 'pelham', 'eastchester', 'tuckahoe', 'bronxville',
    'dobbs ferry', 'ardsley', 'hastings', 'tarrytown', 'sleepy hollow',
    'ossining', 'peekskill', 'mount pleasant', 'greenburgh', 'elmsford',
    'valhalla', 'hawthorne', 'pleasantville', 'briarcliff manor',
    'yorktown', 'mount kisco', 'bedford', 'north castle', 'harrison',
  ];

  // New Jersey (close enough to cause confusion)
  const newJerseyPlaces = [
    'newark', 'jersey city', 'hoboken', 'secaucus', 'weehawken',
    'union city', 'bayonne', 'kearny', 'harrison', 'rutherford',
    'east rutherford', 'meadowlands', 'paramus', 'hackensack',
    'fort lee', 'edgewater', 'englewood', 'teaneck',
    ', nj', ', n.j.',
  ];

  // Connecticut
  const connecticutPlaces = [
    ', ct', ', conn', 'greenwich', 'stamford', 'norwalk', 'bridgeport',
  ];

  const allOutsidePlaces = [
    ...nassauPlaces,
    ...suffolkPlaces,
    ...westchesterPlaces,
    ...newJerseyPlaces,
    ...connecticutPlaces,
  ];

  // Check if the address contains any of the outside-NYC place names.
  // We require that the place name appears as a word boundary (not as a substring
  // of a larger word like "Huntington Ave" matching "huntington").
  // EXCEPTION: street suffixes immediately following the name are fine — we care
  // about CITY names, not street names. A city name at the end of an address or
  // following a comma is the key signal.
  for (const place of allOutsidePlaces) {
    // For NJ/CT we already anchored with comma prefix — check directly
    if (place.startsWith(',')) {
      if (normalized.includes(place)) return true;
      continue;
    }

    // Build a pattern: place name preceded by a comma+space ("..., Huntington, NY")
    // or at start of string, NOT followed by a street suffix token.
    const escapedPlace = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Matches: ", huntington" or ", huntington," or ", huntington ny" etc.
    // Does NOT match: "huntington ave", "huntington st", "huntington blvd"
    const cityPattern = new RegExp(
      `(?:,\\s*)${escapedPlace}(?:\\s*,|\\s+ny\\b|\\s+new york\\b|$)`,
      'i'
    );
    if (cityPattern.test(normalized)) return true;
  }

  return false;
}

/**
 * Validates initial coordinates (often from a scraper). If they are invalid (generic centroids),
 * or the address is generic, falls back to Mapbox API to find better coordinates.
 */
export async function resolveLocationData(
  venueName: string,
  address: string | null | undefined,
  initialLat: number | null | undefined,
  initialLng: number | null | undefined
): Promise<{ lat: number | null; lng: number | null; isVerified: boolean }> {
  
  const isInitialValid = isValidLocation(initialLat, initialLng);
  const isGeneric = isGenericAddress(address);
  
  // If the address explicitly references a suburb / non-NYC municipality, reject
  // immediately. We do NOT attempt geocoding because Mapbox (constrained to the
  // NYC bbox) would return the nearest in-city street with that name instead of
  // the correct out-of-city location — producing a worse wrong answer.
  if (isOutsideNYCMunicipality(address)) {
    console.log(
      `[LocationValidation] Address "${address}" for "${venueName}" references a ` +
      `non-NYC municipality — rejecting coordinates and skipping geocode.`
    );
    return { lat: null, lng: null, isVerified: false };
  }
  
  if (isInitialValid && !isGeneric && initialLat != null && initialLng != null) {
    return {
      lat: initialLat,
      lng: initialLng,
      isVerified: true
    };
  }

  console.log(`[LocationValidation] Initial coordinates (${initialLat}, ${initialLng}) for ${venueName} failed smoke test or address is generic. Triggering fallback.`);

  // Attempt geocoding fallback using unified geocoder
  const searchAddress = address ? `${venueName}, ${address}` : `${venueName}, New York, NY`;
  const fallbackGeo = await geocodeWithMapbox(venueName, searchAddress);

  if (fallbackGeo) {
    const isFallbackValid = isValidLocation(fallbackGeo.lat, fallbackGeo.lng);
    if (isFallbackValid) {
      return {
        lat: fallbackGeo.lat,
        lng: fallbackGeo.lng,
        isVerified: true
      };
    }
  }

  // If fallback fails/returns generic, but initial coordinates were valid, use them (unverified)
  if (isInitialValid && initialLat != null && initialLng != null) {
    return {
      lat: initialLat,
      lng: initialLng,
      isVerified: false
    };
  }

  return {
    lat: null,
    lng: null,
    isVerified: false
  };
}
