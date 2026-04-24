import { load } from 'cheerio';

type Cheerio = ReturnType<typeof load>;

export function extractTextForComparison($: Cheerio): string {
  // Re-parse a clone so we can strip noisy elements without mutating the
  // caller's tree.
  const $clone = load($.html());
  $clone('script, style, noscript, nav, header, footer, aside, svg, form, iframe').remove();
  const bodySelection = $clone('body');
  const text = bodySelection.length ? bodySelection.text() : $clone.text();
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildShingles(text: string, size: number): Set<string> {
  const words = text.split(/\s+/).filter(Boolean);
  const shingles = new Set<string>();
  if (words.length < size) {
    if (words.length > 0) shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    shingles.add(words.slice(i, i + size).join(' '));
  }
  return shingles;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectDuplicateContent(
  pageTexts: Array<{ url: string; text: string }>,
  threshold: number,
): Array<{ urlA: string; urlB: string; similarity: number }> {
  const shingles = pageTexts
    .filter((p) => countWords(p.text) >= 50)
    .map((p) => ({ url: p.url, set: buildShingles(p.text, 4) }));
  const pairs: Array<{ urlA: string; urlB: string; similarity: number }> = [];
  for (let i = 0; i < shingles.length; i += 1) {
    for (let j = i + 1; j < shingles.length; j += 1) {
      const a = shingles[i];
      const b = shingles[j];
      if (!a || !b) continue;
      const sim = jaccard(a.set, b.set);
      if (sim >= threshold) {
        pairs.push({ urlA: a.url, urlB: b.url, similarity: sim });
      }
    }
  }
  return pairs;
}

export function detectHeadingSkips($: Cheerio): Array<{ from: number; to: number }> {
  const skips: Array<{ from: number; to: number }> = [];
  const headings = $('h1, h2, h3, h4, h5, h6').toArray();
  let previous = 0;
  for (const node of headings) {
    const level = Number((node as { tagName?: string }).tagName?.slice(1) ?? 0);
    if (!level) continue;
    if (previous > 0 && level > previous + 1) {
      skips.push({ from: previous, to: level });
    }
    previous = level;
  }
  return skips;
}

export function findMixedContent($: Cheerio): string[] {
  const selectors = ['img[src]', 'script[src]', 'iframe[src]', 'link[href]', 'source[src]'];
  const insecure: string[] = [];
  for (const selector of selectors) {
    const attr = selector.includes('[href]') ? 'href' : 'src';
    $(selector).each((_, node) => {
      const value = $(node).attr(attr);
      if (value && value.startsWith('http://')) {
        insecure.push(value);
      }
    });
  }
  return insecure;
}

export function extractJsonLdTypes($: Cheerio): string[] {
  const types: string[] = [];
  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object') {
          const type = (item as Record<string, unknown>)['@type'];
          if (typeof type === 'string') types.push(type);
          if (Array.isArray(type)) {
            for (const t of type) if (typeof t === 'string') types.push(t);
          }
          const graph = (item as Record<string, unknown>)['@graph'];
          if (Array.isArray(graph)) {
            for (const g of graph) {
              const gType = (g as Record<string, unknown>)?.['@type'];
              if (typeof gType === 'string') types.push(gType);
              if (Array.isArray(gType)) {
                for (const t of gType) if (typeof t === 'string') types.push(t);
              }
            }
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });
  return types;
}

export type ArticleMetadata = {
  modifiedDate?: Date | undefined;
  publishedDate?: Date | undefined;
  author?: string | undefined;
};

export function extractArticleMetadata($: Cheerio): ArticleMetadata {
  const parse = (value: string | undefined): Date | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  let modifiedDate = parse($('meta[property="article:modified_time"]').attr('content'));
  let publishedDate = parse($('meta[property="article:published_time"]').attr('content'));
  let author = $('meta[name="author"]').attr('content')?.trim();

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const all = items.flatMap((it) => {
        const graph = (it as Record<string, unknown>)?.['@graph'];
        return Array.isArray(graph) ? graph : [it];
      });
      for (const item of all) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        if (!modifiedDate && typeof r.dateModified === 'string') {
          modifiedDate = parse(r.dateModified);
        }
        if (!publishedDate && typeof r.datePublished === 'string') {
          publishedDate = parse(r.datePublished);
        }
        if (!author) {
          const a = r.author;
          if (typeof a === 'string') author = a;
          else if (a && typeof a === 'object') {
            const name = (a as Record<string, unknown>).name;
            if (typeof name === 'string') author = name;
          } else if (Array.isArray(a) && a.length > 0) {
            const first = a[0];
            if (typeof first === 'string') author = first;
            else if (first && typeof first === 'object') {
              const name = (first as Record<string, unknown>).name;
              if (typeof name === 'string') author = name;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  });

  return { modifiedDate, publishedDate, author };
}

export function isBlogLike(pageUrl: string, $: Cheerio): boolean {
  if (/\/(blog|post|posts|article|articles|news|noticias|noticia)\//i.test(pageUrl)) {
    return true;
  }
  if ($('article').length > 0) return true;
  const jsonLdTypes = extractJsonLdTypes($);
  if (jsonLdTypes.some((t) => /article|blogposting|newsarticle/i.test(t))) {
    return true;
  }
  return false;
}

export function computeFleschScore(text: string): number | undefined {
  const wordCount = countWords(text);
  if (wordCount < 50) return undefined;
  const sentences = text.split(/[.!?¿¡]+/).filter((s) => s.trim().length > 0).length || 1;
  let syllables = 0;
  for (const word of text.split(/\s+/)) {
    const clean = word.replace(/[^a-záéíóúüñ]/gi, '');
    if (!clean) continue;
    const groups = clean.toLowerCase().match(/[aeiouáéíóúü]+/g);
    syllables += groups ? groups.length : 1;
  }
  const score = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  return Math.round(score * 10) / 10;
}
