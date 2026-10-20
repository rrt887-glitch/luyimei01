/** Cents are rounded half away from zero, like an invoice — Math.round(x * 100) gets 1.005 wrong. */
import { describe, it, expect } from 'vitest';
import { toCents, formatUsd } from '../src/utils/format';
import { round2, money } from '../src/components/admin/quotation/piText';
import { totalsFor } from '../src/components/admin/quotation/piDocument';

describe('toCents / round2', () => {
  it.each([
    [1.005, 1.01],
    [2.675, 2.68],
    [1.255, 1.26],
    [0.335 * 3, 1.01],
    [40.25, 40.25],
    [80.50000000001, 80.5],
    [0.1 + 0.2, 0.3],
    [1.004999, 1],
    [999999999.995, 1000000000],
    [-1.005, -1.01],
    [0, 0]
  ])('%s -> %s', (input, expected) => {
    expect(toCents(input)).toBe(expected);
    expect(round2(input)).toBe(expected);
  });

  it('formats with cents only when there are cents', () => {
    expect(formatUsd(1.005)).toBe('$1.01');
    expect(formatUsd(1200)).toBe('$1,200');
    expect(money(1.005)).toBe('1.01');
  });

  it('quotation totals add up after rounding each line', () => {
    const { subtotal, total } = totalsFor([{ amountUsd: round2(3 * 0.335) }, { amountUsd: 40.25 }], 0, 0, 0);
    expect(subtotal).toBe(41.26);
    expect(total).toBe(41.26);
  });
});
