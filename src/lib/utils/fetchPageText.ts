/**
 * Shared plain-HTTP page fetch + HTML-to-text stripping.
 *
 * Extracted from verifyEventIntegrity.ts so the LLM venue-extraction pipeline
 * (src/lib/llmExtraction/) can reuse the same fetch/strip behavior instead of
 * duplicating it — same User-Agent spoofing, timeout, and tag-stripping used
 * for the event integrity content check.
 */

export async function fetchPageHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Mimic a real browser to avoid bot-blocking on event pages.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export function stripHtmlTags(html: string): string {
  // Remove <script> and <style> blocks entirely (they add noise, no signal).
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Strip all remaining HTML tags.
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Collapse whitespace.
  return cleaned.replace(/\s+/g, ' ').trim();
}

/** Convenience: fetch a URL and return its stripped page text, capped at maxChars. */
export async function fetchPageText(url: string, maxChars = 8_000): Promise<string> {
  const html = await fetchPageHtml(url);
  return stripHtmlTags(html).slice(0, maxChars);
}
