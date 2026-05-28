/**
 * Image URL validation utility.
 *
 * Checks whether a stored imageUrl actually resolves to a valid image
 * by making a lightweight HEAD request and inspecting the Content-Type header.
 *
 * Known-good CDN domains are allowlisted and skipped (no network call needed).
 * This avoids burning time and rate limits on images we know are reliable.
 */

// CDNs we trust unconditionally — no HEAD request needed
const TRUSTED_IMAGE_CDN_HOSTS = new Set([
  'img.ticketmaster.com',
  's1.ticketimg.com',
  'img.evbuc.com',
  'cdn.evbuc.com',
  'img.bandsintown.com',
  'photos.bandsintown.com',
  's3.amazonaws.com',
  'images.dice.fm',
  'songkick.imgix.net',
  'images.squarespace-cdn.com',
]);

const REQUEST_TIMEOUT_MS = 5000;

export interface ImageValidationResult {
  isValid: boolean;
  /** The URL that was checked */
  url: string;
  /** Skipped because the host is on the trusted CDN allowlist */
  wasTrusted?: boolean;
  /** HTTP status returned, if a request was made */
  httpStatus?: number;
  /** Content-Type returned, if available */
  contentType?: string;
  /** Error message if the request itself failed */
  error?: string;
}

/**
 * Validates a single imageUrl.
 * Returns isValid=true for trusted CDN hosts without making a network call.
 * For other hosts, makes a HEAD request and checks Content-Type starts with 'image/'.
 */
export async function validateImageUrl(imageUrl: string): Promise<ImageValidationResult> {
  if (!imageUrl) {
    return { isValid: false, url: imageUrl, error: 'Empty URL' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return { isValid: false, url: imageUrl, error: 'Malformed URL' };
  }

  // Allowlist check — skip network call for trusted CDNs
  if (TRUSTED_IMAGE_CDN_HOSTS.has(parsedUrl.hostname)) {
    return { isValid: true, url: imageUrl, wasTrusted: true };
  }

  // HEAD request with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(imageUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Whim-ImageValidator/1.0',
      },
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') ?? '';
    const isValidImage = response.ok && contentType.startsWith('image/');

    return {
      isValid: isValidImage,
      url: imageUrl,
      httpStatus: response.status,
      contentType,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      url: imageUrl,
      error: errorMessage.includes('abort') ? 'Request timed out' : errorMessage,
    };
  }
}
