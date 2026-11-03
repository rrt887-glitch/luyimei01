/** Foreign-language product text: English supply columns in Excel, and the "missing English" check. */
import { describe, it, expect } from 'vitest';
import { buildProductTemplateSheets, parseProductRows, newProductFromRow } from '../src/components/admin/products/productsSpreadsheet';
import { DEFAULT_CATEGORIES } from '../src/config/categories';
import { missingEnglishFields } from '../src/utils/productText';
import type { Product } from '../src/types';

const template = buildProductTemplateSheets(DEFAULT_CATEGORIES)[0].rows.map(r => r.map(c => String(c ?? '')));

describe('product Excel: English supply columns', () => {
  it('the template has the English supply columns and its sample row imports them', () => {
    const header = template[0];
    for (const h of ['英文交货期', '英文起订量', '英文包装', '英文发货地', '英文产能说明']) expect(header).toContain(h);
    const { parsed, missingColumns } = parseProductRows(template, [], DEFAULT_CATEGORIES);
    expect(missingColumns).toEqual([]);
    const first = parsed[0];
    expect(first.errors).toEqual([]);
    expect(first.item.en).toMatchObject({ leadTime: 'In stock / ships in 3-5 days', baseLocation: 'Guangzhou, China' });
    const product = newProductFromRow(first.item);
    expect(product.translations?.en?.leadTime).toBe('In stock / ships in 3-5 days');
    expect(missingEnglishFields({ ...product, id: 'x' } as Product)).toEqual(['介绍']);
  });
});

describe('missingEnglishFields', () => {
  const base = {
    id: 'custom-1',
    customName: '灌缝机',
    supplySpecs: { leadTime: '现货 / 3-5天发货', moq: '5台', capacityStatus: 'ample', baseLocation: '广东广州' }
  } as unknown as Product;

  it('lists every Chinese text without English', () => {
    expect(missingEnglishFields(base)).toEqual(['名称', '交期', '起订量', '发货地']);
  });

  it('is empty once English is filled', () => {
    const done = { ...base, translations: { en: { name: 'Sealer', leadTime: 'In stock', moq: '5 sets', baseLocation: 'Guangzhou' } } } as Product;
    expect(missingEnglishFields(done)).toEqual([]);
  });
});
