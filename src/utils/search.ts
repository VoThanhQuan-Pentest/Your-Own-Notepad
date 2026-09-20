export type SearchFieldPriority = 1 | 2 | 3;

export interface SearchFieldInput {
  text?: string | null;
  priority: SearchFieldPriority;
}

interface PreparedSearchField {
  priority: SearchFieldPriority;
  text: PreparedSearchText;
}

interface PreparedSearchText {
  normalized: string;
  tokens: string[];
}

export interface SearchTextCache {
  prepared: Map<string, PreparedSearchText>;
}

export interface SearchDocument<T> {
  result: T;
  order: number;
  fields: PreparedSearchField[];
}

interface TokenMatch {
  quality: number;
  distance: number;
  priority: SearchFieldPriority;
}

interface DocumentScore<T> {
  document: SearchDocument<T>;
  wholeMatchPriority: number;
  worstQuality: number;
  qualitySum: number;
  distanceSum: number;
  prioritySum: number;
}

export interface RankedSearchResult<T> {
  result: T;
  matchKind: "exact" | "near";
}

export function createSearchDocument<T>(
  result: T,
  fields: SearchFieldInput[],
  order: number,
  cache?: SearchTextCache,
): SearchDocument<T> {
  return {
    result,
    order,
    fields: fields.flatMap((field) => {
      const source = field.text ?? "";
      const prepared = prepareSearchText(source, cache);
      return prepared.normalized ? [{ priority: field.priority, text: prepared }] : [];
    }),
  };
}

export function createSearchTextCache(): SearchTextCache {
  return { prepared: new Map() };
}

export function searchDocuments<T>(
  documents: SearchDocument<T>[],
  query: string,
  limit = 100,
): T[] {
  return rankSearchDocuments(documents, query, limit).map((item) => item.result);
}

export function selectSearchCandidates<T>(
  documents: SearchDocument<T>[],
  query: string,
): SearchDocument<T>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return documents;
  }
  const wholeMatches = documents.filter((document) =>
    document.fields.some((field) => field.text.normalized.includes(normalizedQuery)),
  );
  if (wholeMatches.length > 0) {
    return wholeMatches;
  }
  const queryTokens = [...new Set(normalizedQuery.split(" "))];
  if (queryTokens.length > 1) {
    const tokenMatches = documents.filter((document) =>
      queryTokens.every((token) =>
        document.fields.some((field) => field.text.normalized.includes(token)),
      ),
    );
    if (tokenMatches.length > 0) {
      return tokenMatches;
    }
  }
  return documents;
}

export function rankSearchDocuments<T>(
  documents: SearchDocument<T>[],
  query: string,
  limit = 100,
): RankedSearchResult<T>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || limit <= 0) {
    return [];
  }
  const queryTokens = [...new Set(normalizedQuery.split(" "))];
  const scored = documents.flatMap((document) => {
    const score = scoreDocument(document, normalizedQuery, queryTokens);
    return score ? [score] : [];
  });
  scored.sort(compareScores);
  return scored.slice(0, limit).map((score) => ({
    result: score.document.result,
    matchKind: score.worstQuality >= 3 ? "exact" : "near",
  }));
}

export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scoreDocument<T>(
  document: SearchDocument<T>,
  normalizedQuery: string,
  queryTokens: string[],
): DocumentScore<T> | null {
  let wholeMatchPriority = 0;
  document.fields.forEach((field) => {
    if (field.text.normalized.includes(normalizedQuery)) {
      wholeMatchPriority = Math.max(wholeMatchPriority, field.priority);
    }
  });

  const matches: TokenMatch[] = [];
  for (const queryToken of queryTokens) {
    const match = bestTokenMatch(document.fields, queryToken);
    if (!match) {
      return null;
    }
    matches.push(match);
  }

  return {
    document,
    wholeMatchPriority,
    worstQuality: Math.min(...matches.map((match) => match.quality)),
    qualitySum: matches.reduce((sum, match) => sum + match.quality, 0),
    distanceSum: matches.reduce((sum, match) => sum + match.distance, 0),
    prioritySum: matches.reduce((sum, match) => sum + match.priority, 0),
  };
}

function bestTokenMatch(fields: PreparedSearchField[], queryToken: string): TokenMatch | null {
  let best: TokenMatch | null = null;
  for (const field of fields) {
    for (const candidate of field.text.tokens) {
      const match = compareToken(queryToken, candidate, field.priority);
      if (match && (!best || compareTokenMatches(match, best) < 0)) {
        best = match;
      }
    }
  }
  return best;
}

function prepareSearchText(source: string, cache?: SearchTextCache): PreparedSearchText {
  const cached = cache?.prepared.get(source);
  if (cached) {
    return cached;
  }
  const normalized = normalizeSearchText(source);
  const prepared = {
    normalized,
    tokens: normalized ? [...new Set(normalized.split(" "))] : [],
  };
  cache?.prepared.set(source, prepared);
  return prepared;
}

function compareToken(
  query: string,
  candidate: string,
  priority: SearchFieldPriority,
): TokenMatch | null {
  if (candidate === query) {
    return { quality: 5, distance: 0, priority };
  }
  if (candidate.startsWith(query)) {
    return { quality: 4, distance: 0, priority };
  }
  if (candidate.includes(query)) {
    return { quality: 3, distance: 0, priority };
  }

  const maximumDistance = fuzzyDistanceFor(query);
  if (maximumDistance === 0 || Math.abs(candidate.length - query.length) > maximumDistance) {
    return null;
  }
  const distance = damerauLevenshtein(query, candidate, maximumDistance);
  if (distance > maximumDistance) {
    return null;
  }
  return { quality: distance === 1 ? 2 : 1, distance, priority };
}

function fuzzyDistanceFor(token: string): number {
  if (token.length <= 2 || token.length > 64) {
    return 0;
  }
  return token.length <= 5 ? 1 : 2;
}

function damerauLevenshtein(left: string, right: string, maximum: number): number {
  let previousPrevious = Array.from({ length: right.length + 1 }, (_, index) => index);
  let previous = [...previousPrevious];

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      let distance = Math.min(
        (current[rightIndex - 1] ?? maximum + 1) + 1,
        (previous[rightIndex] ?? maximum + 1) + 1,
        (previous[rightIndex - 1] ?? maximum + 1) + substitutionCost,
      );
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distance = Math.min(distance, (previousPrevious[rightIndex - 2] ?? maximum + 1) + 1);
      }
      current[rightIndex] = distance;
    }
    previousPrevious = previous;
    previous = current;
  }

  return previous[right.length] ?? maximum + 1;
}

function compareTokenMatches(left: TokenMatch, right: TokenMatch): number {
  return (
    right.quality - left.quality ||
    left.distance - right.distance ||
    right.priority - left.priority
  );
}

function compareScores<T>(left: DocumentScore<T>, right: DocumentScore<T>): number {
  const leftWhole = left.wholeMatchPriority > 0 ? 1 : 0;
  const rightWhole = right.wholeMatchPriority > 0 ? 1 : 0;
  return (
    rightWhole - leftWhole ||
    right.wholeMatchPriority - left.wholeMatchPriority ||
    right.worstQuality - left.worstQuality ||
    right.qualitySum - left.qualitySum ||
    left.distanceSum - right.distanceSum ||
    right.prioritySum - left.prioritySum ||
    left.document.order - right.document.order
  );
}
