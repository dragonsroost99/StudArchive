import { type MarketStandard } from '../settings/settingsStore';

export interface MinifigLike {
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  rebrickable_id: string;
}

export interface PartLike {
  bricklink_id?: string | null;
  brickowl_id?: string | null;
  rebrickable_id: string;
}

function resolveByStandard(
  preferred: MarketStandard,
  ids: { bricklink?: string | null; brickowl?: string | null; rebrickable: string }
): string {
  if (preferred === 'bricklink' && ids.bricklink) return ids.bricklink;
  if (preferred === 'brickowl' && ids.brickowl) return ids.brickowl;
  return ids.bricklink || ids.brickowl || ids.rebrickable;
}

export function getMinifigDisplayId(fig: MinifigLike, marketStandard: MarketStandard): string {
  return resolveByStandard(marketStandard, {
    bricklink: fig.bricklink_id ?? undefined,
    brickowl: fig.brickowl_id ?? undefined,
    rebrickable: fig.rebrickable_id,
  });
}

export function getPartDisplayId(part: PartLike, marketStandard: MarketStandard): string {
  return resolveByStandard(marketStandard, {
    bricklink: part.bricklink_id ?? undefined,
    brickowl: part.brickowl_id ?? undefined,
    rebrickable: part.rebrickable_id,
  });
}
