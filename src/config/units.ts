/**
 * Pricing / quantity units, shared by the product catalogue (website + console) and quotations.
 * `key` is what is stored (product.unit, quotation item unit); labels are shown per language.
 */
export type UnitLang = 'en' | 'zh' | 'ar' | 'ru';

export interface UnitDef {
  key: string;
  label: Record<UnitLang, string>;
  /** Other spellings people type or older data contains; matched case-insensitively. */
  aliases: string[];
}

export const UNITS: UnitDef[] = [
  { key: 'Ton', label: { en: 'Ton', zh: '吨', ar: 'طن', ru: 'т' }, aliases: ['吨', 't', 'mt', 'tons', 'tonne'] },
  { key: 'Kg', label: { en: 'Kg', zh: '千克', ar: 'كغ', ru: 'кг' }, aliases: ['千克', '公斤', 'kgs'] },
  { key: 'SqM', label: { en: 'm²', zh: '平方米', ar: 'م²', ru: 'м²' }, aliases: ['平方', '平米', '平方米', '㎡', 'm2', 'sqm', 'sq m', 'square meter', 'square metre', 'square meters', 'square metres'] },
  { key: 'Meter', label: { en: 'm', zh: '米', ar: 'متر', ru: 'м' }, aliases: ['米', 'm', 'meters', 'metre'] },
  { key: 'Roll', label: { en: 'Roll', zh: '卷', ar: 'لفة', ru: 'рулон' }, aliases: ['卷', 'rolls'] },
  { key: 'Drum', label: { en: 'Drum', zh: '桶', ar: 'برميل', ru: 'бочка' }, aliases: ['桶', 'drums', 'barrel'] },
  { key: 'Bucket', label: { en: 'Pail', zh: '提', ar: 'دلو', ru: 'ведро' }, aliases: ['提', 'pail', 'pails'] },
  { key: 'Bag', label: { en: 'Bag', zh: '袋', ar: 'كيس', ru: 'мешок' }, aliases: ['袋', 'bags'] },
  { key: 'Box', label: { en: 'Carton', zh: '箱', ar: 'كرتون', ru: 'кор.' }, aliases: ['箱', 'carton', 'cartons'] },
  { key: 'Set', label: { en: 'Set', zh: '台/套', ar: 'طقم', ru: 'компл.' }, aliases: ['台', '套', '台/套', 'sets', 'unit(s)'] },
  { key: 'Unit', label: { en: 'Pc', zh: '件', ar: 'قطعة', ru: 'шт.' }, aliases: ['件', '个', 'pcs', 'piece', 'pieces'] }
];

/** Maps a free-text unit ("吨", "/ 平方米", "tons", "Set") to a known unit key, or '' when unknown. */
export function unitKeyFrom(raw: string | undefined): string {
  const v = (raw || '').trim().toLowerCase().replace(/^\/\s*/, '');
  if (!v) return '';
  for (const u of UNITS) {
    if (u.key.toLowerCase() === v || u.label.en.toLowerCase() === v || u.label.zh === v || u.aliases.includes(v)) return u.key;
  }
  return '';
}

/** Label of a unit key in one language (the key itself when unknown). */
export function unitName(key: string, lang: UnitLang): string {
  return UNITS.find(u => u.key === key)?.label[lang] || key;
}
