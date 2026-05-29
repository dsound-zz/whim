/**
 * Sanitizes an address string for better geocoding by Mapbox.
 * Strips out secondary address unit information (e.g. Floor, Fl, Suite, Ste, Apt, Room, Unit, Level, etc.)
 * and their accompanying text before the next comma or end of string.
 * Example: "25 W. 28th St., Top Floor, 10001, Manhattan, NY, US" -> "25 W. 28th St., 10001, Manhattan, NY, US"
 */
export function sanitizeAddressForGeocoding(address: string | null | undefined): string {
  if (!address) return '';

  // Strip out "(NYC)" or " (NYC)" case-insensitively
  const preSanitized = address.replace(/\s*\(nyc\)/gi, '');

  const segments = preSanitized.split(',');
  const secondaryMarkerRegex = /\b(floor|fl|suite|ste|apt|room|unit|level)\b/i;

  const cleanedSegments = segments.map(segment => {
    const trimmed = segment.trim();
    if (!trimmed) return '';

    if (secondaryMarkerRegex.test(trimmed)) {
      // Check if this segment contains actual street address indicators (street names, numbers, abbreviations)
      // to determine if it is a street segment combined with unit details or a standalone unit description segment.
      const isStreetSegment = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|pl|place|dr|drive|way)\b/i.test(trimmed) || /^\d+\s+[a-zA-Z]/.test(trimmed);

      if (isStreetSegment) {
        // Strip the secondary marker and everything after it in this segment.
        // e.g. "123 Main St Floor 2" -> "123 Main St"
        const stripRegex = /\s*\b(floor|fl|suite|ste|apt|room|unit|level)\b.*$/i;
        return trimmed.replace(stripRegex, '').trim();
      } else {
        // standalone secondary unit info segment like "Top Floor", "Suite 4B", discard it.
        return '';
      }
    }
    return trimmed;
  });

  return cleanedSegments.filter(Boolean).join(', ');
}
