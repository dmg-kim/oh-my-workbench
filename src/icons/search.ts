import { simpleIconsIndex } from "./simpleIconsIndex";
import type { SimpleIconMeta } from "./simpleIconsIndex";

export function searchSimpleIcons(query: string, limit = 20): SimpleIconMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return simpleIconsIndex
    .filter(({ title, slug }) => slug.includes(q) || title.toLowerCase().includes(q))
    .slice(0, limit);
}
