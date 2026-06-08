/**
 * Event category classifier.
 *
 * Three-stage pipeline:
 * 1. Platform taxonomy map — deterministic mapping from source platform's own
 *    segment/genre/type labels to Whim's category enum.
 * 2. Keyword scan — scans normalized title + description for high-signal terms.
 * 3. Gemini Flash fallback — for events that pass through stages 1 & 2 unclassified,
 *    a lightweight LLM call makes the final call. Results are logged for offline review.
 *
 * Returns one of Whim's canonical category values.
 */

export type WhimCategory =
  | 'music'
  | 'comedy'
  | 'art'
  | 'theater'
  | 'food_drink'
  | 'fitness'
  | 'community'
  | 'nightlife'
  | 'family'
  | 'sports'
  | 'film'
  | 'other';

// ─── Stage 1: Platform taxonomy maps ─────────────────────────────────────────

/**
 * Maps Ticketmaster's segment + genre labels to Whim categories.
 * TM uses hierarchical classification: segment > genre > subGenre.
 * We only need segment and top-level genre for reliable classification.
 */
const TICKETMASTER_SEGMENT_MAP: Record<string, WhimCategory> = {
  music: 'music',
  sports: 'sports',
  'arts & theatre': 'theater',
  'arts & theater': 'theater',
  film: 'film',
  'family & kids': 'family',
  family: 'family',
  miscellaneous: 'other',
};

const TICKETMASTER_GENRE_MAP: Record<string, WhimCategory> = {
  comedy: 'comedy',
  'stand-up': 'comedy',
  'stand up': 'comedy',
  theatre: 'theater',
  theater: 'theater',
  opera: 'theater',
  ballet: 'theater',
  dance: 'theater',
  film: 'film',
  'food & drink': 'food_drink',
  food: 'food_drink',
  fitness: 'fitness',
  yoga: 'fitness',
  nightlife: 'nightlife',
  club: 'nightlife',
  'visual arts': 'art',
  'fine art': 'art',
  gallery: 'art',
  community: 'community',
  festival: 'community',
  fair: 'community',
  'family friendly': 'family',
  children: 'family',
};

/**
 * Maps Eventbrite's format + category labels.
 */
const EVENTBRITE_CATEGORY_MAP: Record<string, WhimCategory> = {
  music: 'music',
  'film & media': 'film',
  'arts & entertainment': 'art',
  'food & drink': 'food_drink',
  community: 'community',
  'education & knowledge': 'community',
  charity: 'community',
  'sports & fitness': 'fitness',
  family: 'family',
  nightlife: 'nightlife',
  comedy: 'comedy',
  theater: 'theater',
  theatre: 'theater',
  business: 'other',
  technology: 'other',
};

export interface PlatformTaxonomy {
  /** Ticketmaster: tmSegment, tmGenre */
  tmSegment?: string | null;
  tmGenre?: string | null;
  /** Eventbrite: category, subcategory, format */
  ebriteCategory?: string | null;
  ebriteFormat?: string | null;
  /** SeatGeek: taxonomy name, event type */
  sgTaxonomy?: string | null;
  sgType?: string | null;
}

export function classifyFromPlatformTaxonomy(
  taxonomy: PlatformTaxonomy
): WhimCategory | null {
  const { tmSegment, tmGenre, ebriteCategory, ebriteFormat } = taxonomy;

  if (tmSegment) {
    const mapped = TICKETMASTER_SEGMENT_MAP[tmSegment.toLowerCase().trim()];
    if (mapped) return mapped;
  }

  if (tmGenre) {
    const mapped = TICKETMASTER_GENRE_MAP[tmGenre.toLowerCase().trim()];
    if (mapped) return mapped;
  }

  if (ebriteCategory) {
    const mapped = EVENTBRITE_CATEGORY_MAP[ebriteCategory.toLowerCase().trim()];
    if (mapped) return mapped;
  }

  if (ebriteFormat) {
    if (/concert|performance/i.test(ebriteFormat)) return 'music';
    if (/comedy/i.test(ebriteFormat)) return 'comedy';
    if (/film|screening/i.test(ebriteFormat)) return 'film';
  }

  return null;
}

// ─── Stage 2: Keyword scan ────────────────────────────────────────────────────

interface KeywordRule {
  category: WhimCategory;
  patterns: RegExp[];
}

// Ordered by specificity — more specific patterns listed first to avoid misclassification
const KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'comedy',
    patterns: [
      /\bstand[- ]?up\b/i,
      /\bcomedy (night|show|hour|open mic|special)\b/i,
      /\bimprov\b/i,
      /\bcomedian\b/i,
      /\blaugh\b/i,
    ],
  },
  {
    category: 'film',
    patterns: [
      /\bfilm (festival|screening|series)\b/i,
      /\bscreening\b/i,
      /\bmovie night\b/i,
      /\bcinema\b/i,
      /\bdocumentary\b/i,
      /\bshort films?\b/i,
    ],
  },
  {
    category: 'theater',
    patterns: [
      /\btheat(er|re)\b/i,
      /\bbroadway\b/i,
      /\bopera\b/i,
      /\bballet\b/i,
      /\bdance performance\b/i,
      /\bstage (show|production|play)\b/i,
      /\bmusical\b/i,
    ],
  },
  {
    category: 'art',
    patterns: [
      /\bopening (reception|night)\b/i,
      /\bart (show|exhibition|exhibit|walk|fair|gallery)\b/i,
      /\bgallery\b/i,
      /\bexhibit(ion)?\b/i,
      /\binstallation\b/i,
      /\bpainting\b/i,
      /\bsculpture\b/i,
      /\bphotography show\b/i,
    ],
  },
  {
    category: 'food_drink',
    patterns: [
      /\bwine (tasting|dinner|pairing)\b/i,
      /\bbeer (tasting|fest|garden)\b/i,
      /\bfood (market|festival|fair|tour|truck)\b/i,
      /\bcocktail (class|hour|party)\b/i,
      /\bbrunch\b/i,
      /\bdinner (series|event)\b/i,
      /\btasting (menu|event)\b/i,
      /\bwhiskey\b/i,
      /\bfarm[- ]to[- ]table\b/i,
    ],
  },
  {
    category: 'fitness',
    patterns: [
      /\byoga\b/i,
      /\bpilates\b/i,
      /\bworkout\b/i,
      /\b5k\b/i,
      /\bmarathon\b/i,
      /\bhike\b/i,
      /\bcycling\b/i,
      /\bcrossfit\b/i,
      /\bboot camp\b/i,
      /\brun (club|series)\b/i,
    ],
  },
  {
    category: 'sports',
    patterns: [
      /\b(knicks|yankees|mets|giants|jets|rangers|islanders|red bulls)\b/i,
      /\b(nba|mlb|nfl|nhl|mls) (game|match)\b/i,
      /\bchampionship\b/i,
      /\btournament\b/i,
      /\bboxing match\b/i,
      /\bwrestling\b/i,
      /\btennis (open|match)\b/i,
    ],
  },
  {
    category: 'nightlife',
    patterns: [
      /\bdj set\b/i,
      /\bnight(club|life)\b/i,
      /\bclub night\b/i,
      /\bafter[- ]?party\b/i,
      /\bboat party\b/i,
      /\brooftop (party|bar)\b/i,
      /\bhouse (party|music night)\b/i,
      /\bopen bar\b/i,
      /\bbar crawl\b/i,
    ],
  },
  {
    category: 'family',
    patterns: [
      /\bkids?\b/i,
      /\bchildren\b/i,
      /\ball ages\b/i,
      /\bfamily (fun|friendly|day|event)\b/i,
      /\bstory ?time\b/i,
      /\bpuppet\b/i,
      /\bplayground\b/i,
    ],
  },
  {
    category: 'community',
    patterns: [
      /\bfestival\b/i,
      /\bfair\b/i,
      /\bmarket\b/i,
      /\bflea market\b/i,
      /\bparade\b/i,
      /\bblock party\b/i,
      /\bneighborhood\b/i,
      /\bcommunity (event|gathering|meetup)\b/i,
      /\bfundraiser\b/i,
      /\bcharity\b/i,
      /\bvolunteer\b/i,
    ],
  },
  {
    category: 'music',
    patterns: [
      /\bconcert\b/i,
      /\blive music\b/i,
      /\bband\b/i,
      /\bjazz\b/i,
      /\bhip[- ]?hop\b/i,
      /\brap\b/i,
      /\bindierock\b/i,
      /\brock (show|night)\b/i,
      /\beclectic (sounds|music)\b/i,
      /\bopen mic\b/i,
      /\bperforming (live|at)\b/i,
      /\btour (date|stop)\b/i,
      /\balbum (release|launch)\b/i,
    ],
  },
];

export function classifyFromKeywords(
  title: string | null | undefined,
  description: string | null | undefined
): WhimCategory | null {
  const combinedText = `${title ?? ''} ${description ?? ''}`.trim();
  if (!combinedText) return null;

  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combinedText)) {
        return rule.category;
      }
    }
  }

  return null;
}

// ─── Stage 3: Gemini Flash fallback ──────────────────────────────────────────

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const VALID_CATEGORIES = new Set<WhimCategory>([
  'music', 'comedy', 'art', 'theater', 'food_drink',
  'fitness', 'community', 'nightlife', 'family', 'sports', 'film', 'other',
]);

async function classifyWithGemini(
  title: string,
  description: string | null | undefined
): Promise<WhimCategory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[CategoryClassifier] GEMINI_API_KEY not set — skipping LLM fallback');
    return null;
  }

  const descriptionSnippet = description
    ? description.substring(0, 300)
    : 'No description available.';

  const prompt = `You are classifying a local event into exactly one category.

Event title: "${title}"
Event description: "${descriptionSnippet}"

Valid categories (pick exactly one, respond with only the category name, no explanation):
music, comedy, art, theater, food_drink, fitness, community, nightlife, family, sports, film, other

Category:`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          topP: 1,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[CategoryClassifier] Gemini API error: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();

    if (rawAnswer && VALID_CATEGORIES.has(rawAnswer as WhimCategory)) {
      return rawAnswer as WhimCategory;
    }

    console.warn(`[CategoryClassifier] Gemini returned unrecognized category: "${String(rawAnswer)}"`);
    console.warn(`[CategoryClassifier] Full API Response:`, JSON.stringify(data, null, 2));
    return null;
  } catch (error) {
    console.error('[CategoryClassifier] Gemini request failed:', error);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ClassifyEventParams {
  title: string | null | undefined;
  description?: string | null | undefined;
  platformTaxonomy?: PlatformTaxonomy;
  /** If true, skips the Gemini fallback even if the first two stages fail. Default false. */
  skipLlmFallback?: boolean;
  /**
   * Category to use when all classification stages fail. Useful for
   * source-aware defaults — e.g. RA and Songkick are music-first platforms,
   * so their callers pass `defaultCategory: 'music'` instead of falling
   * through to 'other' when the title is just an artist name.
   */
  defaultCategory?: WhimCategory;
}

/**
 * Classifies an event into a Whim category using a three-stage pipeline:
 * 1. Platform taxonomy map (deterministic)
 * 2. Keyword scan (deterministic)
 * 3. Gemini Flash fallback (async, optional)
 *
 * Falls back to `defaultCategory` (or 'other') if all three stages fail.
 */
export async function classifyEventCategory(
  params: ClassifyEventParams
): Promise<WhimCategory> {
  const { title, description, platformTaxonomy, skipLlmFallback = false, defaultCategory = 'other' } = params;

  // Stage 1: Platform taxonomy
  if (platformTaxonomy) {
    const taxonomyResult = classifyFromPlatformTaxonomy(platformTaxonomy);
    if (taxonomyResult) return taxonomyResult;
  }

  // Stage 2: Keyword scan
  const keywordResult = classifyFromKeywords(title, description);
  if (keywordResult) return keywordResult;

  // Stage 3: Gemini Flash fallback
  if (!skipLlmFallback && title) {
    const llmResult = await classifyWithGemini(title, description);
    if (llmResult) return llmResult;
  }

  return defaultCategory;
}
