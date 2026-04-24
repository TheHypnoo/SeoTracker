const TRACKING_PARAM_KEYS = [
  'srsltid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const;

export function safeResolveUrl(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * Strip fragment, trailing slash and lowercase nothing — only the parts that
 * differ between equivalent URLs and break naive equality.
 */
export function normalizeForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of TRACKING_PARAM_KEYS) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function classifyUrlBucket(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path === '/' || path === '') {
      return 'home';
    }
    if (/\/(blog|post|posts|article|articles|news|noticias|noticia|stories)\b/.test(path)) {
      return 'article';
    }
    if (/\/(product|productos|shop|store|tienda|item|items)\b/.test(path)) {
      return 'product';
    }
    if (/\/(category|categoria|categorias|tag|tags|topic|topics|collections?)\b/.test(path)) {
      return 'category';
    }
    if (/\/(page|p)\/\d+/.test(path) || parsed.searchParams.has('page')) {
      return 'pagination';
    }
    if (
      /\/(about|sobre|contact|contacto|legal|privacy|terms|faq|help|soporte|support)\b/.test(path)
    ) {
      return 'static';
    }
    const depth = path.split('/').filter(Boolean).length;
    if (depth >= 3) {
      return 'article';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

/**
 * Pick `budget` URLs from `urls` while spreading the picks across "buckets"
 * (article, product, category, ...) so the audit doesn't focus on a single
 * section of the site.
 */
export function stratifiedSample(urls: string[], budget: number): string[] {
  if (budget <= 0 || urls.length === 0) {
    return [];
  }
  if (urls.length <= budget) {
    return urls;
  }

  const buckets = new Map<string, string[]>();
  for (const url of urls) {
    const bucket = classifyUrlBucket(url);
    const list = buckets.get(bucket) ?? [];
    list.push(url);
    buckets.set(bucket, list);
  }
  const totalBuckets = buckets.size;
  const selected: string[] = [];
  const picked = new Set<string>();
  const bucketIter = [...buckets.entries()];
  for (const [, list] of bucketIter) {
    if (selected.length >= budget) {
      break;
    }
    const first = list[0];
    if (first && !picked.has(first)) {
      picked.add(first);
      selected.push(first);
    }
  }
  let cursor = Math.max(totalBuckets, 1);
  while (selected.length < budget) {
    let anyAdded = false;
    for (const [, list] of bucketIter) {
      if (selected.length >= budget) {
        break;
      }
      const idx = Math.floor((selected.length - totalBuckets) / Math.max(totalBuckets, 1)) + 1;
      const candidate = list[idx] ?? list[cursor % list.length];
      if (candidate && !picked.has(candidate)) {
        picked.add(candidate);
        selected.push(candidate);
        anyAdded = true;
      }
    }
    cursor += 1;
    if (!anyAdded) {
      break;
    }
  }
  if (selected.length < budget) {
    for (const url of urls) {
      if (selected.length >= budget) {
        break;
      }
      if (!picked.has(url)) {
        picked.add(url);
        selected.push(url);
      }
    }
  }
  return selected;
}
