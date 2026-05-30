/**
 * City configuration abstraction.
 *
 * Centralizes all city-specific parameters that were previously hardcoded
 * throughout the codebase (bounding boxes, centroids, proximity bias, etc.).
 * When scaling to new cities, add a new entry to CITY_CONFIGS.
 */

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** Mapbox bbox format: "minLng,minLat,maxLng,maxLat" */
  mapboxParam: string;
}

export interface GenericCentroid {
  lat: number;
  lng: number;
  name: string;
}

export interface CityConfig {
  /** Display name */
  name: string;
  /** URL-safe slug used as a lookup key */
  slug: string;
  /** Geographic bounding box for the metro area */
  boundingBox: BoundingBox;
  /** Mapbox proximity bias: "lng,lat" format */
  proximity: string;
  /** Known generic centroids to reject during geocoding */
  genericCentroids: GenericCentroid[];
  /** Ticketmaster Discovery API city parameter */
  ticketmasterCity: string;
  /** Eventbrite API location.address parameter */
  eventbriteCity: string;
  /** Songkick metro area URL path segment */
  songkickMetroAreaUrl: string;
}

export const CITY_CONFIGS: Record<string, CityConfig> = {
  nyc: {
    name: 'New York City',
    slug: 'nyc',
    boundingBox: {
      minLat: 40.4774,
      maxLat: 40.9176,
      minLng: -74.2591,
      maxLng: -73.7004,
      mapboxParam: '-74.2591,40.4774,-73.7004,40.9176',
    },
    proximity: '-74.0060,40.7128',
    genericCentroids: [
      { lat: 40.664017, lng: -73.88818, name: 'Payne/East NY' },
      { lat: 40.712749, lng: -74.005994, name: 'Generic NYC' },
      { lat: 40.6526, lng: -73.9497, name: 'Generic Brooklyn' },
      { lat: 40.789352, lng: -73.95709, name: 'Generic Manhattan' },
      { lat: 40.7135, lng: -73.8283, name: 'Generic Queens' },
      { lat: 40.847, lng: -73.8972, name: 'Generic Bronx' },
      { lat: 40.58337, lng: -74.149643, name: 'Generic Staten Island' },
    ],
    ticketmasterCity: 'New York',
    eventbriteCity: 'New York',
    songkickMetroAreaUrl: '/metro-areas/7644-us-new-york',
  },
};

/** Default city for the current MVP phase */
const DEFAULT_CITY_SLUG = 'nyc';

/**
 * Retrieves a city configuration by slug.
 * Falls back to the default city if the slug is not found.
 */
export function getCityConfig(slug?: string): CityConfig {
  const lookupSlug = slug ?? DEFAULT_CITY_SLUG;
  const config = CITY_CONFIGS[lookupSlug];

  if (!config) {
    console.warn(`[CityConfig] Unknown city slug "${lookupSlug}", falling back to ${DEFAULT_CITY_SLUG}`);
    return CITY_CONFIGS[DEFAULT_CITY_SLUG];
  }

  return config;
}

/**
 * Returns true if the coordinate falls within the city's bounding box.
 */
export function isWithinCity(lat: number, lng: number, citySlug?: string): boolean {
  const config = getCityConfig(citySlug);
  return (
    lat >= config.boundingBox.minLat &&
    lat <= config.boundingBox.maxLat &&
    lng >= config.boundingBox.minLng &&
    lng <= config.boundingBox.maxLng
  );
}
