import { toAccessibleMediaUrl, toCanonicalStorageUrl } from '../services/networkProxy';

/** Width of the small picture used on cards, lists and thumbnails. */
export const THUMB_WIDTH = 640;

/**
 * The small version of one of the product's pictures (for cards and lists), or the picture itself
 * when it has none. Thumbnails are stored by the canonical URL of the full picture.
 */
export function thumbOf(product: { thumbs?: Record<string, string> }, url: string | undefined): string {
  if (!url) return '';
  const t = product.thumbs?.[toCanonicalStorageUrl(url)] || product.thumbs?.[url];
  return t ? toAccessibleMediaUrl(t) : url;
}
