/** PDF pages that continue the item table start with the table's column header again. */
import { describe, it, expect } from 'vitest';
import { paginate, repeatsHead } from '../src/components/admin/quotation/piOutput';

// A tall sheet: header block, item table (head 300–340, rows every 60 px down to 2740), then totals.
const head = { top: 300, bottom: 340, tableBottom: 2740 };
const rows = Array.from({ length: 40 }, (_, i) => 340 + 60 * (i + 1));
const points = [120, 300, 340, ...rows, 2900, 3000];

describe('PDF pagination', () => {
  const pages = paginate(points, 3000, head);

  it('covers the whole sheet without gaps or overlap', () => {
    expect(pages[0][0]).toBe(0);
    expect(pages[pages.length - 1][1]).toBe(3000);
    for (let i = 1; i < pages.length; i++) expect(pages[i][0]).toBe(pages[i - 1][1]);
  });

  it('continuation pages inside the table repeat the header, and still fit on A4', () => {
    const inside = pages.slice(1).filter(([from]) => repeatsHead(from, head));
    expect(inside.length).toBeGreaterThan(0);
    for (const [from, to] of pages.slice(1)) {
      const headH = repeatsHead(from, head) ? head.bottom - head.top : 0;
      expect(headH + to - from).toBeLessThanOrEqual(1123 - 40 - 44);
    }
  });

  it('never leaves the header alone at the bottom of a page', () => {
    expect(pages.some(([, to]) => to === head.bottom)).toBe(false);
  });

  it('a page that starts after the table does not get a header', () => {
    expect(repeatsHead(2740, head)).toBe(false);
    expect(repeatsHead(100, head)).toBe(false);
    expect(repeatsHead(400, null)).toBe(false);
  });
});
