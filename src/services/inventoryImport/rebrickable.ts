// Rebrickable inventory importer (service layer only; no UI wiring).

export interface BuildPart {
  componentName: string;
  componentColorName: string | null;
  componentColorId?: number | null;
  componentSubtype: 'Part' | 'Minifigure';
  quantity: number;
  designId?: string | null;
  isSpare: boolean;
  imageUrl?: string | null;
   bricklinkId?: string | null;
   brickowlId?: string | null;
   rebrickableId?: string | null;
}

export interface RebrickableSetMetadata {
  name: string;
  setNum: string;
  year?: number | null;
  numParts?: number | null;
  imageUrl: string | null;
  themeId?: number | null;
  themeName?: string | null;
}

export interface RebrickablePartSearchResult {
  partNum: string;
  name: string;
  imageUrl: string | null;
}

export interface RebrickablePartColor {
  colorId: number;
  name: string;
  isTransparent: boolean;
  imageUrl: string | null;
}

const REBRICKABLE_API_KEY = '20c8f718caadb2f0e0eca2a30373592b';
const REBRICKABLE_BASE_URL = 'https://rebrickable.com/api/v3/lego';
const componentImageCache = new Map<string, string | null>();
const partColorsCache = new Map<string, RebrickablePartColor[]>();
const partColorsInFlight = new Map<string, Promise<RebrickablePartColor[]>>();
let rateLimitUntil = 0;
let lastRateLimitLog = 0;

function isRateLimited(): boolean {
  return Date.now() < rateLimitUntil;
}

function setRateLimitCooldown(seconds: number) {
  rateLimitUntil = Date.now() + seconds * 1000;
}

function warnRateLimitedOnce() {
  const now = Date.now();
  if (now - lastRateLimitLog > 15_000) {
    console.warn('[Rebrickable] Skipping image fetches due to recent 429 responses');
    lastRateLimitLog = now;
  }
}

function normalizeSetNumber(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes('-') ? trimmed : `${trimmed}-1`;
}

function looksLikePartNumber(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (trimmed.length > 10) return false;
  if (/\s/.test(trimmed)) return false;
  return /^[0-9A-Za-z]+$/.test(trimmed);
}

export async function fetchComponentImage(
  designId: string,
  subtype: 'part' | 'minifig',
  colorName?: string | null
): Promise<string | null> {
  if (!designId.trim()) return null;
  if (isRateLimited()) {
    warnRateLimitedOnce();
    return null;
  }
  const normalizedId = designId.trim();
  const colorKey = (colorName ?? '').trim().toLowerCase();
  const cacheKey = `${subtype}|${normalizedId}|${colorKey}`;
  if (componentImageCache.has(cacheKey)) {
    return componentImageCache.get(cacheKey) ?? null;
  }

  if (subtype === 'part' && colorKey) {
    try {
      const colors = await fetchPartColorsFromRebrickable(normalizedId);
      const exact = colors.find(
        c => (c.name ?? '').trim().toLowerCase() === colorKey
      );
      const partial = colors.find(
        c => (c.name ?? '').trim().toLowerCase().includes(colorKey)
      );
      const matchUrl = exact?.imageUrl ?? partial?.imageUrl ?? null;
      if (matchUrl) {
        componentImageCache.set(cacheKey, matchUrl);
        return matchUrl;
      }
    } catch (error) {
      console.warn('Rebrickable color image lookup failed', { designId, colorName }, error);
    }
  }

  const resource =
    subtype === 'minifig'
      ? `${REBRICKABLE_BASE_URL}/minifigs/${normalizedId}/`
      : `${REBRICKABLE_BASE_URL}/parts/${normalizedId}/`;
  const resourceWithKey =
    subtype === 'minifig'
      ? `${REBRICKABLE_BASE_URL}/minifigs/${normalizedId}/?key=${REBRICKABLE_API_KEY}`
      : `${REBRICKABLE_BASE_URL}/parts/${normalizedId}/?key=${REBRICKABLE_API_KEY}`;
  try {
    const response = await fetch(resource, {
      headers: {
        Authorization: `key ${REBRICKABLE_API_KEY}`,
        Accept: 'application/json',
        'User-Agent': 'StudArchive/1.0',
      },
    });
    const text = await response.text();
    if (response.status === 429) {
      setRateLimitCooldown(60);
      console.warn('Rebrickable component image fetch throttled 429', resource);
      componentImageCache.set(cacheKey, null);
      return null;
    }
    if (response.status === 403) {
      console.warn('Rebrickable component image fetch blocked (403)', {
        resource,
        status: response.status,
      });
      componentImageCache.set(cacheKey, null);
      return null;
    }
    if (!response.ok) {
      console.warn('Rebrickable component image fetch failed', response.status, text);
      componentImageCache.set(cacheKey, null);
      return null;
    }
    try {
      const data = JSON.parse(text) as {
        part_img_url?: string | null;
        set_img_url?: string | null;
        fig_img_url?: string | null;
      };
      const resolved =
        data.part_img_url ?? data.fig_img_url ?? data.set_img_url ?? null;
      componentImageCache.set(cacheKey, resolved);
      return resolved;
    } catch (error) {
      console.warn('Rebrickable component image parse failed', text);
      componentImageCache.set(cacheKey, null);
      return null;
    }
  } catch (error) {
    console.warn('Rebrickable component image fetch error', error);
    componentImageCache.set(cacheKey, null);
    return null;
  }
}

export async function searchPartsOnRebrickable(
  query: string
): Promise<RebrickablePartSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const commonHeaders: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'StudArchive/1.0',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const url = `${REBRICKABLE_BASE_URL}/parts/?search=${encodeURIComponent(trimmed)}&page_size=20`;
  try {
    const response = await fetch(url, {
      headers: { ...commonHeaders, Authorization: `key ${REBRICKABLE_API_KEY}` },
    });
    const text = await response.text();
    if (response.status === 403) {
      console.warn('Rebrickable part search blocked (403)', url);
      return [];
    }
    if (!response.ok) {
      console.warn('Rebrickable part search failed', response.status, text);
      return [];
    }
    return parsePartSearchResults(trimmed, text);
  } catch (error) {
    console.warn('Rebrickable part search error', error);
    return [];
  }
}

function parsePartSearchResults(
  query: string,
  responseText: string
): RebrickablePartSearchResult[] {
  type PartSearchRow = { part_num?: string; name?: string; part_img_url?: string | null };
  type PartSearchResponse = { results?: PartSearchRow[] };
  let data: PartSearchResponse;
  try {
    data = JSON.parse(responseText) as PartSearchResponse;
  } catch (error) {
    console.warn('Rebrickable part search JSON parse failed', responseText);
    return [];
  }
  const rows = data.results ?? [];
  const mapped = rows
    .filter(r => r?.part_num && r?.name)
    .map(r => ({
      partNum: r.part_num as string,
      name: r.name as string,
      imageUrl: r.part_img_url ?? null,
    }));

  const q = query.toLowerCase();
  const score = (result: RebrickablePartSearchResult): number => {
    const pn = result.partNum.toLowerCase();
    const nm = result.name.toLowerCase();
    if (pn === q) return 0;
    if (pn.startsWith(q)) return 1;
    if (nm.startsWith(q)) return 2;
    if (nm.includes(q)) return 3;
    return 4;
  };
  return mapped.sort((a, b) => score(a) - score(b));
}

export async function fetchPartColorsFromRebrickable(
  partNum: string
): Promise<RebrickablePartColor[]> {
  const trimmed = partNum.trim();
  if (!trimmed) {
    console.warn('[Rebrickable] fetchPartColors called with empty partNum');
    return [];
  }
  if (isRateLimited()) {
    warnRateLimitedOnce();
    return [];
  }

  const cached = partColorsCache.get(trimmed);
  if (cached) return cached;

  const inFlight = partColorsInFlight.get(trimmed);
  if (inFlight) return inFlight;

  const baseUrl = `${REBRICKABLE_BASE_URL}/parts/${encodeURIComponent(
    trimmed
  )}/colors/?page_size=1000`;
  const url = `${baseUrl}&key=${REBRICKABLE_API_KEY}`;

  console.log('[Rebrickable] Fetching colors for partNum', trimmed, url);

  type RawPartColorsResponse = {
    results?: {
      color?: {
        id?: number;
        name?: string;
        is_trans?: boolean | number | null;
      };
      color_id?: number;
      color_name?: string;
      is_trans?: boolean | number | null;
      part?: { part_img_url?: string | null };
      part_img_url?: string | null;
    }[];
  };

  const promise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'StudArchive/1.0',
          Authorization: `key ${REBRICKABLE_API_KEY}`,
        },
      });

      if (!response.ok) {
        console.warn('[Rebrickable] Part colors request failed', {
          partNum: trimmed,
          status: response.status,
          statusText: response.statusText,
        });
        return [];
      }

      let data: RawPartColorsResponse;
      try {
        data = (await response.json()) as RawPartColorsResponse;
      } catch (e) {
        console.warn('[Rebrickable] Failed to parse part colors JSON', { partNum: trimmed, e });
        return [];
      }

      const mapped = mapColorsResponseToRebrickablePartColors(data);
      partColorsCache.set(trimmed, mapped);
      return mapped;
    } catch (error) {
      console.warn('[Rebrickable] Failed to fetch or parse part colors', {
        partNum: trimmed,
        error,
      });
      return [];
    } finally {
      partColorsInFlight.delete(trimmed);
    }
  })();

  partColorsInFlight.set(trimmed, promise);
  return promise;
}

type RawPartColorsResponse = {
  results?: {
    color?: {
      id?: number;
      name?: string;
      is_trans?: boolean | number | null;
    };
    color_id?: number;
    color_name?: string;
    is_trans?: boolean | number | null;
    part?: { part_img_url?: string | null };
    part_img_url?: string | null;
  }[];
};

function mapColorsResponseToRebrickablePartColors(
  data: RawPartColorsResponse
): RebrickablePartColor[] {
  if (!Array.isArray(data.results)) {
    console.warn('[Rebrickable] Unexpected part colors response shape', { data });
    return [];
  }

  const mapped: RebrickablePartColor[] = [];

  for (const entry of data.results) {
    const colorImage =
      (entry as any)?.part?.part_img_url ??
      (entry as any)?.part_img_url ??
      null;
    if (entry?.color && entry.color.id != null && entry.color.name) {
      mapped.push({
        colorId: entry.color.id,
        name: entry.color.name,
        isTransparent: entry.color.is_trans === true || entry.color.is_trans === 1,
        imageUrl: colorImage,
      });
      continue;
    }
    if (entry?.color_id != null && entry?.color_name) {
      mapped.push({
        colorId: entry.color_id,
        name: entry.color_name,
        isTransparent: entry.is_trans === true || entry.is_trans === 1,
        imageUrl: colorImage,
      });
    }
  }

  if (mapped.length === 0) {
    console.warn('[Rebrickable] Part colors response had results, but no mappable colors', {
      data,
    });
  }

  return mapped;
}

export async function fetchSetMetadataFromRebrickable(
  setNumber: string
): Promise<RebrickableSetMetadata | null> {
  const normalized = normalizeSetNumber(setNumber);
  const url = `${REBRICKABLE_BASE_URL}/sets/${normalized}/`;

  const response = await fetch(url, {
    headers: {
      Authorization: `key ${REBRICKABLE_API_KEY}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (response.status === 404) {
    console.warn('Rebrickable set metadata not found', normalized);
    return null;
  }

  if (!response.ok) {
    console.error('Rebrickable set metadata failed', response.status, text);
    throw new Error(`Rebrickable set metadata failed: ${response.status}`);
  }

  type RebrickableSetResponse = {
    name?: string;
    set_num?: string;
    year?: number | null;
    num_parts?: number | null;
    set_img_url?: string | null;
    theme_id?: number | null;
  };

  let data: RebrickableSetResponse;
  try {
    data = JSON.parse(text) as RebrickableSetResponse;
  } catch (error) {
    console.error('Rebrickable set metadata JSON parse error', text);
    throw error;
  }

  const themeId = data.theme_id ?? null;
  let themeName: string | null = null;
  if (themeId !== null && Number.isFinite(themeId)) {
    const themeUrl = `${REBRICKABLE_BASE_URL}/themes/${themeId}/`;
    try {
      const themeResponse = await fetch(themeUrl, {
        headers: {
          Authorization: `key ${REBRICKABLE_API_KEY}`,
          Accept: 'application/json',
        },
      });
      const themeText = await themeResponse.text();
      if (themeResponse.ok) {
        try {
          const parsed = JSON.parse(themeText) as { name?: string | null };
          themeName = parsed?.name ?? null;
        } catch (error) {
          console.warn('Rebrickable theme JSON parse error', themeText);
          themeName = null;
        }
      } else {
        console.warn(
          'Rebrickable theme fetch failed',
          themeResponse.status,
          themeText
        );
      }
    } catch (error) {
      console.warn('Rebrickable theme fetch failed', error);
      themeName = null;
    }
  }

  return {
    name: data.name ?? normalized,
    setNum: data.set_num ?? normalized,
    year: data.year ?? null,
    numParts: data.num_parts ?? null,
    imageUrl: data.set_img_url ?? null,
    themeId,
    themeName,
  };
}

export async function fetchInventoryFromRebrickable(
  setNumber: string
): Promise<BuildPart[]> {
  const normalized = normalizeSetNumber(setNumber);

  const url =
    `${REBRICKABLE_BASE_URL}/sets/${normalized}/parts/` +
    `?page_size=1000`;

  const response = await fetch(url, {
    headers: {
      Authorization: `key ${REBRICKABLE_API_KEY}`, // v3 docs: either ?key= or Authorization header
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (!response.ok) {
    console.error('Rebrickable getParts failed', response.status, text);
    throw new Error(`Rebrickable getParts failed: ${response.status}`);
  }

  type RebrickablePartResult = {
    quantity: number;
    is_spare: boolean;
    part: { part_num: string; name: string };
    color: { id: number; name: string };
    part_img_url?: string | null;
  };

  type RebrickablePartsResponse = {
    results: RebrickablePartResult[];
  };

  let data: RebrickablePartsResponse;
  try {
    data = JSON.parse(text) as RebrickablePartsResponse;
  } catch (e) {
    console.error('Rebrickable JSON parse error', text);
    throw e;
  }

  if (!data.results || !data.results.length) {
    throw new Error('Rebrickable: no parts returned for this set');
  }

  const partRows = data.results.map(p => ({
    componentName: p.part?.name ?? 'Unknown part',
    componentColorName: p.color?.name ?? null,
    componentColorId: p.color?.id ?? null,
    componentSubtype: 'Part', // future: detect minifigs if needed
    quantity: p.quantity ?? 0,
    designId: p.part?.part_num ?? null,
    isSpare: !!p.is_spare,
    imageUrl: p.part_img_url ?? (p as any)?.part?.part_img_url ?? null,
  }));

  // Try to fetch minifigs; if it fails, just return parts.
  let minifigRows: BuildPart[] = [];
  try {
    minifigRows = await fetchSetMinifigs(normalized);
  } catch (error) {
    console.error('Rebrickable minifig fetch failed', error);
    minifigRows = [];
  }

  return dedupeBuildParts([...partRows, ...minifigRows]);
}

type RebrickableMinifigResult = {
  set_num?: string;
  fig_num?: string; // some responses include fig_num at root, but minifig.fig_num is authoritative
  name?: string; // some responses include name at root, but minifig.name is authoritative
  quantity?: number;
  set_img_url?: string | null;
  img_url?: string | null;
  minifig?: {
    fig_num?: string;
    name?: string;
  };
};

type RebrickableMinifigResponse = {
  results: RebrickableMinifigResult[];
  next?: string | null;
};

function dedupeBuildParts(parts: BuildPart[]): BuildPart[] {
  const map = new Map<
    string,
    {
      componentName: string;
      componentColorName: string | null;
      componentSubtype: 'Part' | 'Minifigure';
      quantity: number;
      designId?: string | null;
      isSpare: boolean;
      imageUrl?: string | null;
      bricklinkId?: string | null;
      brickowlId?: string | null;
      rebrickableId?: string | null;
    }
  >();

  for (const p of parts) {
    const subtype = p.componentSubtype || 'Part';
    const key = [
      subtype.toLowerCase(),
      p.designId ?? '',
      p.componentColorName ?? '',
      p.isSpare ? '1' : '0',
    ].join('|');
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        quantity: (existing.quantity ?? 0) + (p.quantity ?? 0),
        imageUrl: existing.imageUrl || p.imageUrl || null,
        bricklinkId: existing.bricklinkId || p.bricklinkId || null,
        brickowlId: existing.brickowlId || p.brickowlId || null,
        rebrickableId: existing.rebrickableId || p.rebrickableId || null,
      });
    } else {
      map.set(key, {
        componentName: p.componentName,
        componentColorName: p.componentColorName,
        componentSubtype: subtype,
        quantity: p.quantity ?? 0,
        designId: p.designId ?? null,
        isSpare: !!p.isSpare,
        imageUrl: p.imageUrl ?? null,
        bricklinkId: p.bricklinkId ?? null,
        brickowlId: p.brickowlId ?? null,
        rebrickableId: p.rebrickableId ?? null,
      });
    }
  }

  return Array.from(map.values());
}

type RebrickableMinifigDetail = {
  fig_num?: string;
  name?: string;
  img_url?: string | null;
  set_img_url?: string | null;
  external_ids?: {
    BrickLink?: string[];
    BrickOwl?: string[];
  };
};

async function fetchMinifigDetail(figNum: string): Promise<RebrickableMinifigDetail | null> {
  const url = `${REBRICKABLE_BASE_URL}/minifigs/${figNum}/`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `key ${REBRICKABLE_API_KEY}`,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn('Rebrickable minifig detail failed', figNum, response.status, text);
      return null;
    }
    const data = JSON.parse(text) as RebrickableMinifigDetail;
    return data;
  } catch (error) {
    console.error('Rebrickable minifig detail fetch error', figNum, error);
    return null;
  }
}

export interface RebrickableMinifigMetadata {
  figNum: string;
  name: string;
  imageUrl: string | null;
}

export async function fetchMinifigMetadataFromRebrickable(
  figNum: string
): Promise<RebrickableMinifigMetadata | null> {
  try {
    const response = await fetch(`${REBRICKABLE_BASE_URL}/minifigs/${figNum}/`, {
      headers: {
        Authorization: `key ${REBRICKABLE_API_KEY}`,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn('Rebrickable minifig metadata failed', figNum, response.status, text);
      return null;
    }
    const data = JSON.parse(text) as RebrickableMinifigDetail;
    return {
      figNum: data.fig_num ?? figNum,
      name: data.name ?? figNum,
      imageUrl: data.img_url ?? data.set_img_url ?? null,
    };
  } catch (error) {
    console.error('Rebrickable minifig metadata fetch error', figNum, error);
    return null;
  }
}

async function fetchSetMinifigs(setNumber: string): Promise<BuildPart[]> {
  let url =
    `${REBRICKABLE_BASE_URL}/sets/${setNumber}/minifigs/` +
    `?page_size=1000`;

  const collected = new Map<
    string,
    {
      componentName: string;
      designId: string | null;
      quantity: number;
      imageUrl: string | null;
    }
  >();
  const detailCache = new Map<string, RebrickableMinifigDetail | null>();

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `key ${REBRICKABLE_API_KEY}`,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      console.error('Rebrickable getMinifigs failed', response.status, text);
      break;
    }
    let data: RebrickableMinifigResponse;
    try {
      data = JSON.parse(text) as RebrickableMinifigResponse;
    } catch (e) {
      console.error('Rebrickable getMinifigs JSON parse error', text);
      break;
    }

    if (Array.isArray(data.results)) {
      for (const m of data.results) {
        const listFigId = m.minifig?.fig_num ?? m.fig_num ?? m.set_num ?? null;
        let figId = listFigId;
        let figName = m.minifig?.name ?? m.name ?? null;
        let imageUrl: string | null = null;
        let bricklinkId: string | null = null;
        let brickowlId: string | null = null;

        if (listFigId) {
          if (!detailCache.has(listFigId)) {
            detailCache.set(listFigId, await fetchMinifigDetail(listFigId));
          }
          const detail = detailCache.get(listFigId);
          if (detail?.fig_num) {
            figId = detail.fig_num;
          }
          if (detail?.name) {
            figName = detail.name;
          }
          imageUrl = detail?.img_url ?? detail?.set_img_url ?? null;
          bricklinkId = detail?.external_ids?.BrickLink?.[0] ?? null;
          brickowlId = detail?.external_ids?.BrickOwl?.[0] ?? null;
        }

        const keySource = (figId ?? figName ?? '').trim().toLowerCase();
        const key = keySource || 'unknown';
        const existing = collected.get(key);
        const qty = m.quantity ?? 0;
        if (existing) {
          collected.set(key, {
            ...existing,
            quantity: (existing.quantity ?? 0) + qty,
            imageUrl: existing.imageUrl ?? imageUrl ?? null,
          });
        } else {
          collected.set(key, {
            componentName: figName ?? figId ?? 'Minifigure',
            designId: figId ?? null,
            quantity: qty,
            imageUrl: imageUrl ?? null,
            bricklinkId,
            brickowlId,
            rebrickableId: figId ?? listFigId ?? null,
          });
        }
      }
    }

    url = data.next ?? '';
  }

  return Array.from(collected.values()).map(entry => ({
    componentName: entry.componentName,
    componentColorName: null,
    componentSubtype: 'Minifigure',
    quantity: entry.quantity ?? 0,
    designId: entry.designId ?? null,
    isSpare: false,
    imageUrl: entry.imageUrl ?? null,
  }));
}
