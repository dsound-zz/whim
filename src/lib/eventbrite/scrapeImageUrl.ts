/** Shape of the `image` field embedded in Eventbrite's scraped __SERVER_DATA__ event objects. */
export interface EventbriteScrapedImage {
  url: string;
  image_sizes?: {
    large?: string;
    medium?: string;
    small?: string;
  };
  original?: { url: string };
}

/**
 * Resolves the best available image URL from a scraped Eventbrite event's `image` field.
 * Prefers the untransformed original — image_sizes.large and the base url can still
 * carry a small crop (e.g. h=200&w=267) depending on which listing page the event was
 * scraped from.
 */
export function getEventbriteScrapeImageUrl(image: EventbriteScrapedImage | undefined | null): string | null {
  if (!image) return null;
  if (typeof image.original?.url === 'string' && image.original.url.startsWith('http')) {
    return image.original.url;
  }
  const base = image.image_sizes?.large ?? image.url;
  if (typeof base !== 'string') return null;
  // Strip Eventbrite's CDN resize query params so img.evbuc.com serves the full image.
  return base.split('?')[0] || null;
}
