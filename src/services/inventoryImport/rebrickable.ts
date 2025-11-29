// Rebrickable inventory importer (service layer only; no UI wiring).

export interface BuildPart {
  componentName: string;
  componentColorName: string | null;
  componentSubtype: 'Part' | 'Minifigure';
  quantity: number;
  designId?: string | null;
  isSpare: boolean;
  imageUrl?: string | null;
}

export interface RebrickableSetMetadata {
  name: string;
  setNum: string;
  year?: number | null;
  numParts?: number | null;
  imageUrl: string | null;
}

const REBRICKABLE_API_KEY = '20c8f718caadb2f0e0eca2a30373592b';
const REBRICKABLE_BASE_URL = 'https://rebrickable.com/api/v3/lego';

function normalizeSetNumber(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes('-') ? trimmed : `${trimmed}-1`;
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
  };

  let data: RebrickableSetResponse;
  try {
    data = JSON.parse(text) as RebrickableSetResponse;
  } catch (error) {
    console.error('Rebrickable set metadata JSON parse error', text);
    throw error;
  }

  return {
    name: data.name ?? normalized,
    setNum: data.set_num ?? normalized,
    year: data.year ?? null,
    numParts: data.num_parts ?? null,
    imageUrl: data.set_img_url ?? null,
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
    color: { name: string };
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
    componentSubtype: 'Part', // future: detect minifigs if needed
    quantity: p.quantity ?? 0,
    designId: p.part?.part_num ?? null,
    isSpare: !!p.is_spare,
    imageUrl: (p as any)?.part_img_url ?? null,
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
      });
    } else {
      map.set(key, {
        componentName: p.componentName,
        componentColorName: p.componentColorName,
        componentSubtype: subtype,
        quantity: p.quantity ?? 0,
        designId: p.designId ?? null,
        isSpare: !!p.isSpare,
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
