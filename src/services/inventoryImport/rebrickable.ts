// Rebrickable inventory importer (service layer only; no UI wiring).

export interface BuildPart {
  componentName: string;
  componentColorName: string | null;
  componentSubtype: 'Part' | 'Minifigure';
  quantity: number;
  designId?: string | null;
  isSpare: boolean;
}

const REBRICKABLE_API_KEY = '20c8f718caadb2f0e0eca2a30373592b';
const REBRICKABLE_BASE_URL = 'https://rebrickable.com/api/v3/lego';

function normalizeSetNumber(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.includes('-') ? trimmed : `${trimmed}-1`;
}

export async function fetchInventoryFromRebrickable(
  setNumber: string
): Promise<BuildPart[]> {
  const normalized = normalizeSetNumber(setNumber);

  const url =
    `${REBRICKABLE_BASE_URL}/sets/${normalized}/parts/` +
    `?page_size=1000&inc_minifigs=1`;

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
  }));

  // Try to fetch minifigs; if it fails, just return parts.
  let minifigRows: BuildPart[] = [];
  try {
    minifigRows = await fetchSetMinifigs(normalized);
  } catch (error) {
    console.error('Rebrickable minifig fetch failed', error);
    minifigRows = [];
  }

  return [...partRows, ...minifigRows];
}

type RebrickableMinifigResult = {
  set_num?: string;
  fig_num?: string;
  name?: string;
  quantity?: number;
  set_img_url?: string | null;
  img_url?: string | null;
};

type RebrickableMinifigResponse = {
  results: RebrickableMinifigResult[];
  next?: string | null;
};

async function fetchSetMinifigs(setNumber: string): Promise<BuildPart[]> {
  let url =
    `${REBRICKABLE_BASE_URL}/sets/${setNumber}/minifigs/` +
    `?page_size=1000`;

  const collected: BuildPart[] = [];

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
      data.results.forEach(m => {
        collected.push({
          componentName: m.name ?? 'Minifigure',
          componentColorName: null,
          componentSubtype: 'Minifigure',
          quantity: m.quantity ?? 0,
          designId: m.fig_num ?? m.set_num ?? null,
          isSpare: false,
        });
      });
    }

    url = data.next ?? '';
  }

  return collected;
}
