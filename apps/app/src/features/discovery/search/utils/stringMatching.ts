/**
 * Utility functions for clean, deterministic search text comparison.
 */

export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^\w\s-]/g, " ")        // replace punctuation with space (preserves hyphens)
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim();
}

export function tokenizeSearchText(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Checks if normalized titles are identical.
 * E.g. "Truffles" === "Truffles," -> true
 */
export function isExactTitleMatch(title: string, query: string): boolean {
  const normTitle = normalizeSearchText(title);
  const normQuery = normalizeSearchText(query);
  if (!normTitle || !normQuery) return false;
  if (normTitle === normQuery) return true;
  // Whitespace and hyphen collapsed exact match (e.g. "match day" === "matchday", "match-point" === "match point")
  const collapsedTitle = normTitle.replace(/[\s-]+/g, "");
  const collapsedQuery = normQuery.replace(/[\s-]+/g, "");
  return collapsedTitle === collapsedQuery;
}

export enum TextMatchTier {
  EXACT_NAME = 1,                 // 1. EXACT FULL NAME MATCH ("Match Point" === "match point")
  PHRASE_AT_START = 2,            // 2. EXACT FULL QUERY PHRASE AT START OF NAME ("Match Point Sports Arena")
  PHRASE_ANYWHERE = 3,            // 3. EXACT QUERY PHRASE ANYWHERE IN NAME ("The Match Point Arena")
  ORDERED_TOKENS_AT_START = 4,    // 4. ALL QUERY WORDS MATCH IN THE SAME ORDER AT START OF NAME ("Match ... Point")
  ORDERED_TOKENS_ANYWHERE = 5,    // 5. ALL QUERY WORDS MATCH IN THE SAME ORDER ANYWHERE IN NAME ("The ... Match ... Point")
  QUERY_WORDS_INDIVIDUALLY = 6,   // 6. QUERY WORDS MATCH INDIVIDUALLY IN NAME (unordered or partial)
  PREFIX_PARTIAL_IN_NAME = 7,     // 7. PREFIX/partial word matches ("mat" -> "Match Point")
  ADDRESS_MATCH = 8,              // 8. ADDRESS / AREA MATCH
  WEAKER_SEARCHABLE_TEXT = 9,     // 9. OTHER WEAKER SEARCHABLE TEXT (metadata, description)
  // Aliases for compatibility
  PHRASE_IN_NAME = 2,
  ALL_TOKENS_NAME = 4,
  PREFIX_TOKEN_NAME = 7,
  METADATA_MATCH = 9,
  NO_MATCH = 0,                   // 0. EXCLUDE (unrelated)
}

export interface TextMatchAnalysis {
  tier: TextMatchTier;
  tierScore: number;
  matchPosition: number;
  tokenOrderScore?: number;
  isExactName: boolean;
  isPhraseInName: boolean;
  isAllTokensInName: boolean;
  isPrefixTokenInName: boolean;
  addressMatchesLocality: boolean;
  metadataMatches: boolean;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KNOWN_BANGALORE_LOCALITIES = [
  "koramangala", "indiranagar", "hsr layout", "hsr", "whitefield",
  "jp nagar", "jayanagar", "mg road", "brigade road", "church street",
  "richmond town", "richmond road", "bellandur", "marathahalli",
  "electronic city", "sarjapur road", "sarjapur", "btm layout", "btm",
  "banashankari", "malleshwaram", "rajajinagar", "sadashivanagar",
  "hebbal", "yelahanka", "vidyaranyapura", "kammanahalli",
  "kalyan nagar", "frazer town", "ulsoor", "halasuru", "vasanth nagar",
  "cunningham road", "lavelle road", "residency road",
];

/**
 * Deterministically analyzes the text relevance tier between a query and a candidate place/item.
 * Follows the Planless Search Ranking Hierarchy (9 deterministic levels):
 * 1. EXACT FULL NAME MATCH
 * 2. EXACT FULL QUERY PHRASE AT START OF NAME
 * 3. EXACT QUERY PHRASE ANYWHERE IN NAME
 * 4. ALL QUERY WORDS MATCH IN THE SAME ORDER AT START OF NAME
 * 5. ALL QUERY WORDS MATCH IN THE SAME ORDER ANYWHERE IN NAME
 * 6. QUERY WORDS MATCH INDIVIDUALLY IN NAME
 * 7. PREFIX / PARTIAL WORD MATCHES
 * 8. ADDRESS / AREA MATCH
 * 9. OTHER WEAKER SEARCHABLE TEXT
 */
export function analyzeTextMatchTier(
  query: string,
  candidate: {
    title?: string;
    name?: string;
    place_address?: string;
    location?: string;
    description?: string;
    subcategory?: string;
    displayLabel?: string;
    types?: string[];
  },
  locationQuery?: string
): TextMatchAnalysis {
  const normQuery = normalizeSearchText(query);
  const rawTitle = candidate.title || candidate.name || "";
  const normFullTitle = normalizeSearchText(rawTitle);

  const result: TextMatchAnalysis = {
    tier: TextMatchTier.NO_MATCH,
    tierScore: 0,
    matchPosition: 9999,
    tokenOrderScore: 0,
    isExactName: false,
    isPhraseInName: false,
    isAllTokensInName: false,
    isPrefixTokenInName: false,
    addressMatchesLocality: false,
    metadataMatches: false,
  };

  if (!normQuery) {
    return result;
  }

  // Detect if query contains or ends with a known locality (e.g. "match point indiranagar")
  let queryForName = normQuery;
  let effectiveLoc = locationQuery ? normalizeSearchText(locationQuery) : "";

  if (!effectiveLoc) {
    for (const loc of KNOWN_BANGALORE_LOCALITIES) {
      if (normQuery.endsWith(" " + loc)) {
        const potentialName = normQuery.slice(0, normQuery.length - loc.length).trim();
        if (potentialName.length > 0) {
          queryForName = potentialName;
          effectiveLoc = loc;
          break;
        }
      }
    }
  }

  // Check locality match in address / location
  const rawAddress = [candidate.place_address, candidate.location].filter(Boolean).join(" ");
  const normAddress = normalizeSearchText(rawAddress);
  const addressTokens = new Set(tokenizeSearchText(normAddress));

  if (effectiveLoc && normAddress) {
    const locTokens = tokenizeSearchText(effectiveLoc);
    if (normAddress.includes(effectiveLoc) || (locTokens.length > 0 && locTokens.every((t) => addressTokens.has(t)))) {
      result.addressMatchesLocality = true;
    }
  }

  // Split title into primary name and parenthetical annotations
  // e.g. "BEL cricket ground (KSCA matches)" -> primary: "BEL cricket ground", parenthetical: "KSCA matches"
  const primaryTitle = rawTitle.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const normPrimaryTitle = normalizeSearchText(primaryTitle) || normFullTitle;
  const parentheticalMatches = rawTitle.match(/\(([^)]+)\)/g);
  const parentheticalText = parentheticalMatches
    ? parentheticalMatches.map((m) => m.replace(/[()]/g, "")).join(" ")
    : "";
  const normParenthetical = normalizeSearchText(parentheticalText);

  // Check matching on both the name-specific query component and the full query
  const queriesToCheck = queryForName !== normQuery ? [queryForName, normQuery] : [normQuery];

  for (const q of queriesToCheck) {
    const qTokens = tokenizeSearchText(q);
    const primaryTokens = tokenizeSearchText(normPrimaryTitle);
    const primaryTokenSet = new Set(primaryTokens);

    // ─── 1. EXACT FULL NAME MATCH ───────────────────────────────────────────
    if (normPrimaryTitle && isExactTitleMatch(normPrimaryTitle, q)) {
      result.tier = TextMatchTier.EXACT_NAME;
      result.tierScore = 100000;
      result.matchPosition = 0;
      result.tokenOrderScore = 1.0;
      result.isExactName = true;
      result.isPhraseInName = true;
      result.isAllTokensInName = true;
      result.isPrefixTokenInName = true;
      return result;
    }

    if (normPrimaryTitle && q.length >= 2) {
      // ─── 2. EXACT FULL QUERY PHRASE AT START OF NAME ────────────────────────
      const isStartPhrase =
        normPrimaryTitle.startsWith(q + " ") ||
        new RegExp(`^${escapeRegex(q)}(\\s|$)`).test(normPrimaryTitle);

      const collTitle = normPrimaryTitle.replace(/[\s-]+/g, "");
      const collQ = q.replace(/[\s-]+/g, "");
      const isStartCollapsed =
        q.length >= 4 &&
        collTitle.startsWith(collQ) &&
        (collTitle.length === collQ.length || normPrimaryTitle.startsWith(q));

      if (isStartPhrase || isStartCollapsed) {
        result.tier = TextMatchTier.PHRASE_AT_START;
        result.tierScore = 90000;
        result.matchPosition = 0;
        result.tokenOrderScore = 1.0;
        result.isPhraseInName = true;
        result.isAllTokensInName = true;
        result.isPrefixTokenInName = true;
        return result;
      }

      // ─── 3. EXACT QUERY PHRASE ANYWHERE IN NAME ─────────────────────────────
      const phraseRegex = new RegExp(`(^|\\s)${escapeRegex(q)}(\\s|$)`);
      if (phraseRegex.test(normPrimaryTitle)) {
        const rawIdx = normPrimaryTitle.indexOf(q);
        const matchPos = rawIdx >= 0 ? rawIdx : 5;
        result.tier = TextMatchTier.PHRASE_ANYWHERE;
        result.tierScore = 80000 - Math.min(5000, matchPos * 100);
        result.matchPosition = matchPos;
        result.tokenOrderScore = 1.0;
        result.isPhraseInName = true;
        result.isAllTokensInName = true;
        result.isPrefixTokenInName = true;
        return result;
      }

      if (qTokens.length >= 2) {
        // Find ordered query tokens in title tokens
        let qIdx = 0;
        let firstTokenIdx = -1;
        for (let tIdx = 0; tIdx < primaryTokens.length; tIdx++) {
          if (primaryTokens[tIdx] === qTokens[qIdx]) {
            if (firstTokenIdx === -1) firstTokenIdx = tIdx;
            qIdx++;
            if (qIdx === qTokens.length) break;
          }
        }
        const allTokensInOrder = qIdx === qTokens.length;

        // ─── 4. ALL QUERY WORDS MATCH IN THE SAME ORDER AT START OF NAME ───────
        if (allTokensInOrder && firstTokenIdx === 0) {
          result.tier = TextMatchTier.ORDERED_TOKENS_AT_START;
          result.tierScore = 70000;
          result.matchPosition = 0;
          result.tokenOrderScore = 1.0;
          result.isAllTokensInName = true;
          return result;
        }

        // ─── 5. ALL QUERY WORDS MATCH IN THE SAME ORDER ANYWHERE IN NAME ───────
        if (allTokensInOrder && firstTokenIdx > 0) {
          result.tier = TextMatchTier.ORDERED_TOKENS_ANYWHERE;
          result.tierScore = 60000 - Math.min(5000, firstTokenIdx * 200);
          result.matchPosition = firstTokenIdx * 10;
          result.tokenOrderScore = 0.9;
          result.isAllTokensInName = true;
          return result;
        }

        // ─── 6. QUERY WORDS MATCH INDIVIDUALLY IN NAME (unordered / partial) ───
        const matchedQueryTokens = qTokens.filter((tok) => primaryTokenSet.has(tok));
        if (matchedQueryTokens.length > 0) {
          const ratio = matchedQueryTokens.length / qTokens.length;
          const firstWordMatches = primaryTokenSet.has(qTokens[0]);
          const firstMatchedTitleIdx = primaryTokens.findIndex((t) => qTokens.includes(t));
          const matchPos = firstMatchedTitleIdx >= 0 ? firstMatchedTitleIdx * 10 : 50;

          // If all tokens match (but out of order), or >= 50% of tokens match
          if (ratio >= 0.5 || matchedQueryTokens.length >= 2 || (qTokens.length === 2 && firstWordMatches)) {
            result.tier = TextMatchTier.QUERY_WORDS_INDIVIDUALLY;
            result.tierScore = 50000 + Math.floor(ratio * 5000) + (firstWordMatches ? 2000 : 0) - matchPos;
            result.matchPosition = matchPos;
            result.tokenOrderScore = ratio * (firstWordMatches ? 0.8 : 0.5);
            result.isAllTokensInName = ratio === 1.0;
            return result;
          }
        }
      }

      // ─── 7. PREFIX / PARTIAL WORD MATCHES ─────────────────────────────────
      // A: Single-word query matches prefix of a title token
      if (qTokens.length === 1 && q.length >= 3) {
        const prefixIdx = primaryTokens.findIndex((tok) => tok.startsWith(q));
        if (prefixIdx !== -1) {
          result.tier = TextMatchTier.PREFIX_PARTIAL_IN_NAME;
          const matchPos = prefixIdx * 10;
          result.tierScore = 40000 + (prefixIdx === 0 ? 5000 : 0) - matchPos;
          result.matchPosition = matchPos;
          result.isPrefixTokenInName = true;
          return result;
        }
      }

      // B: Multi-word query where leading tokens match and last token is prefix
      if (qTokens.length >= 2) {
        const leading = qTokens.slice(0, -1);
        const lastTok = qTokens[qTokens.length - 1];
        if (leading.every((tok, i) => primaryTokens[i] === tok) && primaryTokens.length > leading.length) {
          if (primaryTokens[leading.length].startsWith(lastTok)) {
            result.tier = TextMatchTier.PREFIX_PARTIAL_IN_NAME;
            result.tierScore = 48000;
            result.matchPosition = 0;
            result.isPrefixTokenInName = true;
            return result;
          }
        }
      }

      // C: Typo tolerance / Levenshtein (strict, min length 4, sim >= 0.88)
      if (q.length >= 4) {
        const sim = levenshteinSimilarity(normPrimaryTitle, q);
        if (sim >= 0.88) {
          result.tier = TextMatchTier.PREFIX_PARTIAL_IN_NAME;
          result.tierScore = 38000;
          result.matchPosition = 20;
          result.isPrefixTokenInName = true;
          return result;
        }
      }
    }
  }

  // ─── 8. ADDRESS / AREA MATCH ──────────────────────────────────────────────
  if (result.addressMatchesLocality) {
    result.tier = TextMatchTier.ADDRESS_MATCH;
    result.tierScore = 20000;
    result.matchPosition = 500;
    return result;
  }

  if (normAddress && normQuery.length >= 3) {
    const qTokens = tokenizeSearchText(normQuery);
    if (normAddress.includes(normQuery) || (qTokens.length > 0 && qTokens.every((t) => addressTokens.has(t)))) {
      result.tier = TextMatchTier.ADDRESS_MATCH;
      result.tierScore = 20000;
      result.matchPosition = 500;
      result.addressMatchesLocality = true;
      return result;
    }
  }

  // ─── 9. OTHER WEAKER SEARCHABLE TEXT ──────────────────────────────────────
  const typesStr = Array.isArray(candidate.types) ? candidate.types.join(" ") : "";
  const metaText = [
    candidate.subcategory,
    candidate.displayLabel,
    candidate.description,
    typesStr,
    normParenthetical,
  ].filter(Boolean).join(" ");
  const normMeta = normalizeSearchText(metaText);

  if (normMeta && normQuery.length >= 3) {
    const metaTokens = new Set(tokenizeSearchText(normMeta));
    const qTokens = tokenizeSearchText(normQuery);
    const allMetaTokensMatch = qTokens.length > 0 && qTokens.every((tok) => metaTokens.has(tok));
    if (allMetaTokensMatch || normMeta.includes(normQuery)) {
      result.tier = TextMatchTier.WEAKER_SEARCHABLE_TEXT;
      result.tierScore = 10000;
      result.matchPosition = 900;
      result.metadataMatches = true;
      return result;
    }
  }

  return result;
}

/**
 * Checks if the venue name starts with the search query (brand/branch match)
 * or if any token in title starts with query (prefix match for query >= 3 chars).
 * E.g. query "truffles" matches "Truffles Indiranagar"
 * E.g. query "match" matches "Matchday"
 * E.g. query "turf" matches "Bengaluru Turf Inc"
 */
export function isPrefixBrandMatch(title: string, query: string): boolean {
  const normTitle = normalizeSearchText(title);
  const normQuery = normalizeSearchText(query);
  if (!normTitle || !normQuery) return false;
  if (normTitle.startsWith(normQuery)) {
    return true;
  }
  // Check if any word token in title starts with query (if query >= 3 chars)
  if (normQuery.length >= 3) {
    const tokens = tokenizeSearchText(normTitle);
    if (tokens.some((t) => t.startsWith(normQuery))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if all words in the search query appear in the venue title.
 * E.g. query "third coffee wave" matches "Third Wave Coffee Roasters"
 */
export function isAllTokensMatch(title: string, query: string): boolean {
  const titleTokens = new Set(tokenizeSearchText(title));
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return false;
  return queryTokens.every((token) => titleTokens.has(token));
}

/**
 * Computes token overlap ratio (0.0 to 1.0) of query tokens present in title.
 */
export function tokenOverlapScore(title: string, query: string): number {
  const titleTokens = new Set(tokenizeSearchText(title));
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      matched++;
    } else {
      // Partial prefix token match
      for (const t of titleTokens) {
        if (t.startsWith(token) || token.startsWith(t)) {
          matched += 0.5;
          break;
        }
      }
    }
  }

  return Math.min(matched / queryTokens.length, 1.0);
}

/**
 * Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Normalized Levenshtein similarity score between 0.0 and 1.0.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeSearchText(a);
  const normB = normalizeSearchText(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, 1.0 - dist / maxLen);
}

/**
 * Typo tolerance: checks if query is within edit distance threshold.
 */
export function isFuzzyMatch(title: string, query: string, threshold = 0.82): boolean {
  const normTitle = normalizeSearchText(title);
  const normQuery = normalizeSearchText(query);
  if (!normTitle || !normQuery) return false;

  // If short string, 1 edit distance
  if (normQuery.length <= 4) {
    return levenshteinDistance(normTitle, normQuery) <= 1;
  }

  // Check similarity against full title or against any title token
  if (levenshteinSimilarity(normTitle, normQuery) >= threshold) {
    return true;
  }

  const titleTokens = tokenizeSearchText(title);
  return titleTokens.some((t) => levenshteinSimilarity(t, normQuery) >= threshold);
}

export const normalizeString = normalizeSearchText;
export const calculateLevenshteinSimilarity = levenshteinSimilarity;
export const tokenMatchRatio = tokenOverlapScore;

export function isBidirectionalBrandMatch(title: string, query: string): boolean {
  if (isPrefixBrandMatch(title, query) || isPrefixBrandMatch(query, title)) {
    return true;
  }
  const titleTokens = tokenizeSearchText(title);
  const queryTokens = tokenizeSearchText(query);
  if (titleTokens.length === 0 || queryTokens.length === 0) return false;

  // Multi-token brand matches: require at least 2 tokens to avoid single generic words
  // (e.g. "football", "cafe", "court") matching as full brands
  if (queryTokens.length >= 2 && isAllTokensMatch(title, query)) {
    return true;
  }
  if (titleTokens.length >= 2 && isAllTokensMatch(query, title)) {
    return true;
  }

  const titleSet = new Set(titleTokens);
  let overlap = 0;
  for (const t of queryTokens) {
    if (titleSet.has(t)) overlap++;
  }
  const ratio = overlap / Math.max(queryTokens.length, titleTokens.length);
  return overlap >= 2 && ratio >= 0.5;
}

export function matchesExactOrBrand(query: string, title: string): { isExact: boolean; isBrandMatch: boolean } {
  const isExact = isExactTitleMatch(title, query);
  const isBrandMatch = !isExact && isBidirectionalBrandMatch(title, query);
  return { isExact, isBrandMatch };
}

