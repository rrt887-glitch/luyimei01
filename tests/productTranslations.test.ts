/** Foreign-language product text: English / Arabic / Russian columns in Excel, and the "missing English" check. */
import { describe, it, expect } from 'vitest';
import { buildProductTemplateSheets, parseProductRows, newProductFromRow, updatedProductFromRow } from '../src/components/admin/products/productsSpreadsheet';
import { DEFAULT_CATEGORIES } from '../src/config/categories';
import { missingEnglishFields } from '../src/utils/productText';
import type { Product } from '../src/types';

const template = buildProductTemplateSheets(DEFAULT_CATEGORIES)[0].rows.map(r => r.map(c => String(c ?? '')));

describe('product Excel: foreign-language columns', () => {
  it('the template has English, Arabic and Russian columns and its sample row imports them', () => {
    const header = template[0];
    for (const lang of ['英文', '阿拉伯文', '俄文'])
      for (const f of ['名称', '规格', '描述', '交货期', '起订量', '包装', '发货地', '产能说明']) expect(header).toContain(lang + f);
    const { parsed, missingColumns } = parseProductRows(template, [], DEFAULT_CATEGORIES);
    expect(missingColumns).toEqual([]);
    const first = parsed[0];
    expect(first.errors).toEqual([]);
    expect(first.item.translations.en).toMatchObject({ leadTime: 'In stock / ships in 3-5 days', baseLocation: 'Guangzhou, China' });
    expect(first.item.translations.ar?.name).toBe('طلاء رصف ملون مضاد للانزلاق');
    expect(first.item.translations.ru?.name).toBe('Цветное противоскользящее покрытие');
    const product = newProductFromRow(first.item);
    expect(product.translations?.en?.leadTime).toBe('In stock / ships in 3-5 days');
    expect(product.translations?.ru?.name).toBe('Цветное противоскользящее покрытие');
    expect(missingEnglishFields({ ...product, id: 'x' } as Product)).toEqual(['介绍']);
  });
});

describe('product Excel: import into an existing product', () => {
  it('fills Arabic / Russian columns and keeps texts whose cells are empty', () => {
    const header = template[0];
    const row = header.map(() => '');
    const set = (h: string, v: string) => (row[header.indexOf(h)] = v);
    set('商品名称*', '灌缝机'); set('型号*', 'SEAL-1'); set('分类*', DEFAULT_CATEGORIES[0].name.zh); set('标价(USD)*', '100'); set('计价单位*', '台/套');
    set('阿拉伯文交货期', 'متوفر'); set('俄文起订量', '5 шт.');
    const existing = { id: 'p1', model: 'SEAL-1', translations: { en: { name: 'Sealer' }, ar: { name: 'آلة' } } } as unknown as Product;
    const { parsed } = parseProductRows([header, row], [existing], DEFAULT_CATEGORIES);
    expect(parsed[0].errors).toEqual([]);
    expect(parsed[0].existing?.id).toBe('p1');
    const updated = updatedProductFromRow(existing, parsed[0].item);
    expect(updated.translations).toEqual({ en: { name: 'Sealer' }, ar: { name: 'آلة', leadTime: 'متوفر' }, ru: { moq: '5 шт.' } });
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
