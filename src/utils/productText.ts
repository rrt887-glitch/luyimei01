import { Product, ProductTextFields, SupportedLanguage } from '../types';
import { initialProducts } from '../data/products';
import { ProductCategoryDef, labelForCategoryId } from '../config/categories';
import { unitKeyFrom, unitName } from '../config/units';

export interface LocalizedProduct {
  name: string;
  desc: string;
  spec: string;
  unit: string;
  /** The category this product is filed under (managed in the console). */
  category: string;
  /** Short type line for cards: the built-in sub-type (e.g. "Cutting equipment") or the category. */
  kind: string;
  leadTime: string;
  moq: string;
  capacityLabel: string;
  baseLocation: string;
  packaging: string;
}

type Dict = { productsData: Record<string, string> } & Record<string, any>;

const SUPPLY_FIELDS = ['leadTime', 'moq', 'capacityLabel', 'baseLocation', 'packaging'] as const;

/**
 * Every product text in the visitor's language.
 *
 * Chinese is the product's own fields. Other languages use, in order:
 *   1. the product's `translations[lang]` (entered in the console),
 *   2. its English translation,
 *   3. for the built-in catalogue, the translation shipped in code — but only while the Chinese
 *      text is still the original (an edited Chinese value must not show a stale translation),
 *   4. the Chinese text, so nothing is ever blank.
 */
export function localizeProduct(
  p: Product,
  lang: SupportedLanguage,
  d: Dict,
  categories: ProductCategoryDef[]
): LocalizedProduct {
  const data = d.productsData as Record<string, string>;
  const builtin = initialProducts.find(cp => cp.id === p.id);
  const own: ProductTextFields = (lang !== 'zh' && p.translations?.[lang]) || {};
  const en: ProductTextFields = (lang !== 'zh' && p.translations?.en) || {};

  const pick = (key: keyof ProductTextFields, zhValue: string, builtinZh?: string): string => {
    if (lang === 'zh') return zhValue;
    const fromOwn = (own[key] || '').trim() || (en[key] || '').trim();
    if (fromOwn) return fromOwn;
    if (builtin && builtinZh !== undefined && zhValue === builtinZh) {
      const shipped = builtin.translations?.[lang]?.[key] || builtin.translations?.en?.[key];
      if (shipped) return shipped;
    }
    return zhValue;
  };

  // Name / description / spec: built-in translation keys are already localized by the dictionary.
  const name = p.customName ? pick('name', p.customName) : data[p.nameKey] || p.nameKey || p.model;
  const desc = p.customDesc ? pick('desc', p.customDesc) : data[p.descKey] || '';
  const spec = p.customSpec ? pick('spec', p.customSpec) : data[p.specKey] || '';

  const supply = p.supplySpecs;
  const supplyText = {} as Record<(typeof SUPPLY_FIELDS)[number], string>;
  for (const f of SUPPLY_FIELDS) {
    const zhValue = (supply?.[f] || '').trim();
    supplyText[f] = zhValue ? pick(f, zhValue, builtin?.supplySpecs?.[f]) : '';
  }

  const category = labelForCategoryId(categories, p.type, lang);
  const keepsBuiltinKind = !!builtin && builtin.type === p.type && builtin.catKey === p.catKey && !!data[p.catKey];

  return {
    name,
    desc,
    spec,
    // A unit chosen in the console (a key such as 'SqM') is shown in the visitor's language;
    // free text from older data is shown as written; otherwise the built-in dictionary unit.
    unit: p.unit ? (unitKeyFrom(p.unit) ? `/ ${unitName(unitKeyFrom(p.unit), lang)}` : p.unit) : data[p.unitKey] || '',
    category,
    kind: keepsBuiltinKind ? data[p.catKey] : category,
    ...supplyText
  };
}

const FIELD_LABELS: Record<keyof ProductTextFields, string> = {
  name: '名称',
  desc: '介绍',
  spec: '规格',
  leadTime: '交期',
  moq: '起订量',
  capacityLabel: '产能说明',
  baseLocation: '发货地',
  packaging: '包装'
};

/**
 * Chinese texts of this product that the English page would show in Chinese (no English entered,
 * and no shipped translation still valid). Arabic and Russian fall back to English, so English
 * is the one that must be filled. Returns the Chinese labels, e.g. ['交期', '起订量'].
 */
export function missingEnglishFields(p: Product): string[] {
  const builtin = initialProducts.find(cp => cp.id === p.id);
  const en = p.translations?.en || {};
  const out: string[] = [];
  const check = (key: keyof ProductTextFields, zhValue: string | undefined, builtinZh?: string) => {
    const v = (zhValue || '').trim();
    if (!v || (en[key] || '').trim()) return;
    if (builtin && builtinZh !== undefined && v === (builtinZh || '').trim() && builtin.translations?.en?.[key]) return;
    out.push(FIELD_LABELS[key]);
  };
  // Name / description / spec are only free text when set in the console (else dictionary keys).
  if (p.customName) check('name', p.customName);
  if (p.customDesc) check('desc', p.customDesc);
  if (p.customSpec) check('spec', p.customSpec, builtin?.customSpec);
  for (const f of SUPPLY_FIELDS) check(f, p.supplySpecs?.[f], builtin?.supplySpecs?.[f]);
  return out;
}
