import { Product, ProductTranslations } from '../../../types';
import { ProductCategoryDef } from '../../../config/categories';
import { UNITS, unitKeyFrom } from '../../../config/units';
import { SheetSpec } from '../../../utils/xlsx';

/**
 * Product spreadsheet layout shared by the template, the export and the bulk import.
 * An exported catalogue can be edited and imported again: rows are matched to existing products
 * by model number.
 */
type FieldKey =
  | 'name'
  | 'model'
  | 'category'
  | 'price'
  | 'unit'
  | 'tierPrice'
  | 'tierMinQty'
  | 'spec'
  | 'desc'
  | 'stock'
  | 'featured'
  | 'year'
  | 'leadTime'
  | 'moq'
  | 'packaging'
  | 'baseLocation'
  | 'capacityLabel'
  | 'images'
  | 'videoUrl'
  | 'enName'
  | 'enSpec'
  | 'enDesc';

interface Column {
  key: FieldKey;
  header: string;
  required?: boolean;
  width: number;
  aliases: string[];
  help: string;
}

export const MAX_PRODUCT_IMPORT_ROWS = 500;
const MAX_IMAGES = 20;

export const PRODUCT_COLUMNS: Column[] = [
  { key: 'name', header: '商品名称', required: true, width: 26, aliases: ['名称', '产品名称', '展示名称', 'name', 'product name'], help: '必填，官网显示的中文名称，最多 200 字。' },
  { key: 'model', header: '型号', required: true, width: 16, aliases: ['商品型号', '产品型号', 'model', 'sku'], help: '必填，最多 120 字。用来识别同一件商品：和已有商品型号相同时，默认跳过，也可以选择用表格内容更新。' },
  { key: 'category', header: '分类', required: true, width: 12, aliases: ['商品分类', '类别', 'category', 'type'], help: '必填，填商品库里已有的分类名称（见下方「可填的分类」）。' },
  { key: 'price', header: '标价(USD)', required: true, width: 14, aliases: ['标价', '价格', '单价', 'price', 'price(usd)'], help: '必填，可写区间，如 $950–$1,350；只填数字会自动加 $。' },
  { key: 'unit', header: '计价单位', required: true, width: 10, aliases: ['单位', 'unit'], help: '必填，见下方「可填的单位」，如 吨、平方米、台/套。' },
  { key: 'tierPrice', header: '批量价(USD)', width: 14, aliases: ['批量价', '批发价', 'tier price'], help: '选填，如 $850。' },
  { key: 'tierMinQty', header: '批量起订数量', width: 12, aliases: ['批量数量', '起批数量', 'tier qty'], help: '选填，享受批量价的最少数量，只填数字；不填按 10。' },
  { key: 'spec', header: '规格', width: 24, aliases: ['规格型号', '规格说明', 'spec', 'specification'], help: '选填，最多 200 字，如 25 kg / 袋装。' },
  { key: 'desc', header: '商品描述', width: 40, aliases: ['描述', '详情', '产品描述', 'description'], help: '选填，最多 2000 字。' },
  { key: 'stock', header: '库存状态', width: 10, aliases: ['库存', '有无现货', 'stock'], help: '选填：有货 / 缺货。不填为「有货」。' },
  { key: 'featured', header: '首页推荐', width: 10, aliases: ['推荐', 'featured'], help: '选填：是 / 否。不填为「否」。' },
  { key: 'year', header: '年份', width: 8, aliases: ['年款', 'year'], help: '选填，如 2026。' },
  { key: 'leadTime', header: '交货期', width: 18, aliases: ['发货时间', 'lead time'], help: '选填，如 现货 / 24-48小时发货。' },
  { key: 'moq', header: '起订量', width: 14, aliases: ['最小起订量', 'moq'], help: '选填，如 10桶 / 250kg。' },
  { key: 'packaging', header: '包装', width: 20, aliases: ['包装方式', 'packaging'], help: '选填。' },
  { key: 'baseLocation', header: '发货地', width: 16, aliases: ['生产基地', '发货仓', 'base location'], help: '选填，如 广州黄埔智造基地。' },
  { key: 'capacityLabel', header: '产能说明', width: 20, aliases: ['产能', 'capacity'], help: '选填，如 月产800吨 · 常备库存200吨。' },
  { key: 'images', header: '图片链接', width: 40, aliases: ['图片', '图片地址', 'images', 'image url'], help: `选填，https 开头的图片地址，多张用换行或分号隔开，最多 ${MAX_IMAGES} 张，第一张为主图。也可以导入后在商品库里上传图片。` },
  { key: 'videoUrl', header: '视频链接', width: 30, aliases: ['视频', 'video', 'video url'], help: '选填，https 开头的视频地址。' },
  { key: 'enName', header: '英文名称', width: 26, aliases: ['english name', 'name (en)'], help: '选填，英文版官网显示；不填则显示中文名称。' },
  { key: 'enSpec', header: '英文规格', width: 24, aliases: ['english spec', 'spec (en)'], help: '选填。' },
  { key: 'enDesc', header: '英文描述', width: 40, aliases: ['english description', 'description (en)'], help: '选填。' }
];

const normalize = (s: string) => String(s || '').replace(/[*＊\s]/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();

const unitChoices = () => UNITS.map(u => u.label.zh).join(' / ');
const categoryChoices = (categories: ProductCategoryDef[]) => categories.map(c => c.name.zh).join(' / ');

export function buildProductTemplateSheets(categories: ProductCategoryDef[]): SheetSpec[] {
  const mat = categories.find(c => c.id === 'material')?.name.zh || categories[0]?.name.zh || '';
  const eqp = categories.find(c => c.id === 'equipment')?.name.zh || categories[1]?.name.zh || mat;
  const example = (values: Partial<Record<FieldKey, string | number>>) => PRODUCT_COLUMNS.map(c => values[c.key] ?? '');
  return [
    {
      name: '商品',
      widths: PRODUCT_COLUMNS.map(c => c.width),
      rows: [
        PRODUCT_COLUMNS.map(c => (c.required ? `${c.header}*` : c.header)),
        example({
          name: '彩色防滑路面材料',
          model: 'LYM-ANTI-01',
          category: mat,
          price: '$12–$18',
          unit: '平方米',
          tierPrice: '$11',
          tierMinQty: 1000,
          spec: '3–5 mm 厚 / 多色可选',
          desc: '用于公交站、坡道和学校路段，防滑耐磨，可按需调色。',
          stock: '有货',
          featured: '是',
          year: 2026,
          leadTime: '现货 / 3-5天发货',
          moq: '500 平方米',
          packaging: '25kg 桶装 / 托盘海运',
          baseLocation: '广州黄埔智造基地',
          capacityLabel: '月产 5 万平方米',
          enName: 'Colored Anti-slip Pavement Coating',
          enSpec: '3–5 mm / multiple colours'
        }),
        example({
          name: '小型路面灌缝机',
          model: 'LYM-SEAL-60',
          category: eqp,
          price: '$2,600',
          unit: '台/套',
          spec: '60L 加热罐 / 汽油动力',
          stock: '有货',
          featured: '否',
          year: 2026,
          leadTime: '15天交付'
        })
      ]
    },
    {
      name: '填写说明',
      header: false,
      widths: [22, 100],
      rows: [
        ['商品批量上架模板 · 填写说明', ''],
        ['', ''],
        ['1. 在「商品」工作表里从第 2 行开始填写，每行一件商品。两行示例可以删除或覆盖。', ''],
        ['2. 第一行标题不要修改；带 * 的列必须填写。', ''],
        ['3. 型号和商品库里已有商品相同时，默认跳过；导入时可以勾选「用表格内容更新已有商品」。', ''],
        [`4. 一次最多导入 ${MAX_PRODUCT_IMPORT_ROWS} 行。导入前会先预览，有问题的行不会导入。`, ''],
        ['5. 导入后商品立即在官网显示。图片可以填链接，也可以导入后在商品库里逐个上传。', ''],
        ['', ''],
        ['列', '说明'],
        ...PRODUCT_COLUMNS.map(c => [c.required ? `${c.header}*` : c.header, c.help]),
        ['', ''],
        ['可填的分类', categoryChoices(categories)],
        ['可填的单位', unitChoices()]
      ]
    }
  ];
}

export function buildProductExportSheets(
  products: Product[],
  categories: ProductCategoryDef[],
  displayName: (p: Product) => string,
  displaySpec: (p: Product) => string,
  /** Built-in dictionary unit text ("/ 吨") for products that never stored a unit key. */
  builtinUnit: (p: Product) => string | undefined
): SheetSpec[] {
  const catName = (id: string) => categories.find(c => c.id === id)?.name.zh || id;
  const unitLabel = (p: Product) => {
    const key = unitKeyFrom(p.unit) || unitKeyFrom(builtinUnit(p)) || (p.type === 'equipment' ? 'Set' : '');
    return UNITS.find(u => u.key === key)?.label.zh || p.unit || '';
  };
  return [
    {
      name: '商品',
      widths: PRODUCT_COLUMNS.map(c => c.width),
      rows: [
        PRODUCT_COLUMNS.map(c => c.header),
        ...products.map(p => {
          const en = p.translations?.en || {};
          const values: Record<FieldKey, string | number> = {
            name: displayName(p),
            model: p.model,
            category: catName(p.type),
            price: p.price,
            unit: unitLabel(p),
            tierPrice: p.tierPrices?.[0]?.priceUsd || '',
            tierMinQty: p.tierPrices?.[0]?.minQty ?? '',
            spec: displaySpec(p),
            desc: p.customDesc || '',
            stock: p.inStock ? '有货' : '缺货',
            featured: p.featured ? '是' : '否',
            year: p.year || '',
            leadTime: p.supplySpecs?.leadTime || '',
            moq: p.supplySpecs?.moq || '',
            packaging: p.supplySpecs?.packaging || '',
            baseLocation: p.supplySpecs?.baseLocation || '',
            capacityLabel: p.supplySpecs?.capacityLabel || '',
            // Bundled pictures (site assets) are not URLs another site could use; only real links.
            images: (p.images || []).filter(u => /^https:\/\//.test(u)).join('\n'),
            videoUrl: /^https:\/\//.test(p.videoUrl || '') ? p.videoUrl! : '',
            enName: en.name || '',
            enSpec: en.spec || '',
            enDesc: en.desc || ''
          };
          return PRODUCT_COLUMNS.map(c => values[c.key]);
        })
      ]
    }
  ];
}

/** What one row turns into: the fields of a new product, or of an update to an existing one. */
export interface ProductImportItem {
  name: string;
  model: string;
  type: string;
  price: string;
  unit: string;
  tierPrices?: { minQty: number; priceUsd: string }[];
  spec?: string;
  desc?: string;
  inStock?: boolean;
  featured?: boolean;
  year?: number;
  supplySpecs: { leadTime?: string; moq?: string; packaging?: string; baseLocation?: string; capacityLabel?: string };
  images?: string[];
  videoUrl?: string;
  en: { name?: string; spec?: string; desc?: string };
}

export interface ParsedProductRow {
  rowNumber: number;
  item: ProductImportItem;
  errors: string[];
  /** An existing product with this model number (import may update it). */
  existing?: Product;
  /** Same model as an earlier row of this file. */
  duplicateRow?: number;
}

const YES = ['是', 'y', 'yes', 'true', '1', '推荐', '√'];
const NO = ['否', 'n', 'no', 'false', '0', '不推荐', ''];
const IN_STOCK = ['有货', '现货', '在售', '上架', 'yes', 'y', 'in stock', '1', 'true'];
const OUT_OF_STOCK = ['缺货', '无货', '售罄', '下架', 'no', 'n', 'out of stock', '0', 'false'];

function formatPrice(raw: string): string {
  const v = raw.trim();
  // A plain number (Excel number cell): "$1,350"; anything else is kept as typed.
  if (/^\d+(\.\d+)?$/.test(v)) return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return v;
}

export function parseProductRows(
  rows: string[][],
  existingProducts: Product[],
  categories: ProductCategoryDef[]
): { parsed: ParsedProductRow[]; missingColumns: string[] } {
  if (rows.length === 0) return { parsed: [], missingColumns: PRODUCT_COLUMNS.filter(c => c.required).map(c => c.header) };
  const headerIndex = Math.max(
    0,
    rows.slice(0, 5).findIndex(r => r.some(cell => PRODUCT_COLUMNS.some(c => c.required && [c.header, ...c.aliases].some(h => normalize(h) === normalize(cell)))))
  );
  const map = new Map<FieldKey, number>();
  rows[headerIndex].forEach((cell, i) => {
    const n = normalize(cell || '');
    if (!n) return;
    const col = PRODUCT_COLUMNS.find(c => [c.header, ...c.aliases].some(h => normalize(h) === n));
    if (col && !map.has(col.key)) map.set(col.key, i);
  });
  const missingColumns = PRODUCT_COLUMNS.filter(c => c.required && !map.has(c.key)).map(c => c.header);
  if (missingColumns.length) return { parsed: [], missingColumns };

  const byModel = new Map<string, Product>();
  for (const p of existingProducts) if (!p.isDeleted && p.model) byModel.set(p.model.trim().toLowerCase(), p);
  const seenRows = new Map<string, number>();
  const findCategory = (text: string) => {
    const t = text.trim().toLowerCase();
    return categories.find(c => c.id.toLowerCase() === t || Object.values(c.name).some(n => String(n || '').trim().toLowerCase() === t));
  };
  const get = (row: string[], key: FieldKey) => {
    const i = map.get(key);
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const parsed: ParsedProductRow[] = [];
  rows.slice(headerIndex + 1, headerIndex + 1 + MAX_PRODUCT_IMPORT_ROWS).forEach((row, offset) => {
    if (!row.some(c => String(c || '').trim())) return;
    const rowNumber = headerIndex + 2 + offset;
    const errors: string[] = [];
    const tooLong = (label: string, v: string, max: number) => v.length > max && errors.push(`${label}超过 ${max} 字`);

    const name = get(row, 'name');
    const model = get(row, 'model');
    if (!name) errors.push('缺少商品名称');
    if (!model) errors.push('缺少型号');
    tooLong('商品名称', name, 200);
    tooLong('型号', model, 120);

    const categoryText = get(row, 'category');
    const category = categoryText ? findCategory(categoryText) : undefined;
    if (!categoryText) errors.push('缺少分类');
    else if (!category) errors.push(`分类「${categoryText}」在商品库里不存在`);

    const price = formatPrice(get(row, 'price'));
    if (!price) errors.push('缺少标价');
    tooLong('标价', price, 64);

    const unitText = get(row, 'unit');
    const unit = unitKeyFrom(unitText);
    if (!unitText) errors.push('缺少计价单位');
    else if (!unit) errors.push(`单位「${unitText}」不认识`);

    const tierPrice = formatPrice(get(row, 'tierPrice'));
    const tierQtyText = get(row, 'tierMinQty');
    const tierQty = tierQtyText ? Number(tierQtyText.replace(/[,，\s]/g, '')) : 10;
    if (tierQtyText && (!Number.isFinite(tierQty) || tierQty <= 0)) errors.push(`批量起订数量「${tierQtyText}」不是正数`);
    tooLong('批量价', tierPrice, 64);

    const spec = get(row, 'spec');
    const desc = get(row, 'desc');
    tooLong('规格', spec, 200);
    tooLong('商品描述', desc, 2000);

    const stockText = get(row, 'stock').toLowerCase();
    let inStock: boolean | undefined;
    if (stockText) {
      if (IN_STOCK.includes(stockText)) inStock = true;
      else if (OUT_OF_STOCK.includes(stockText)) inStock = false;
      else errors.push(`库存状态「${get(row, 'stock')}」请填 有货 或 缺货`);
    }
    const featuredText = get(row, 'featured').toLowerCase();
    let featured: boolean | undefined;
    if (featuredText) {
      if (YES.includes(featuredText)) featured = true;
      else if (NO.includes(featuredText)) featured = false;
      else errors.push(`首页推荐「${get(row, 'featured')}」请填 是 或 否`);
    }
    const yearText = get(row, 'year');
    const year = yearText ? Number(yearText) : undefined;
    if (yearText && (!Number.isInteger(year) || year! < 1990 || year! > 2100)) errors.push(`年份「${yearText}」不对`);

    const imageText = get(row, 'images');
    const images = imageText ? imageText.split(/[\n\r;；,，\s]+/).map(s => s.trim()).filter(Boolean) : [];
    const badImage = images.find(u => !/^https:\/\/\S+$/.test(u) || u.length > 2000);
    if (badImage) errors.push(`图片链接要以 https:// 开头：${badImage.slice(0, 40)}`);
    if (images.length > MAX_IMAGES) errors.push(`图片最多 ${MAX_IMAGES} 张`);
    const videoUrl = get(row, 'videoUrl');
    if (videoUrl && (!/^https:\/\/\S+$/.test(videoUrl) || videoUrl.length > 2000)) errors.push('视频链接要以 https:// 开头');

    const supplySpecs = {
      leadTime: get(row, 'leadTime') || undefined,
      moq: get(row, 'moq') || undefined,
      packaging: get(row, 'packaging') || undefined,
      baseLocation: get(row, 'baseLocation') || undefined,
      capacityLabel: get(row, 'capacityLabel') || undefined
    };
    for (const [label, v] of [['交货期', supplySpecs.leadTime], ['起订量', supplySpecs.moq], ['包装', supplySpecs.packaging], ['发货地', supplySpecs.baseLocation], ['产能说明', supplySpecs.capacityLabel]] as const) {
      tooLong(label, v || '', 200);
    }
    const en = { name: get(row, 'enName') || undefined, spec: get(row, 'enSpec') || undefined, desc: get(row, 'enDesc') || undefined };
    tooLong('英文名称', en.name || '', 300);
    tooLong('英文规格', en.spec || '', 500);
    tooLong('英文描述', en.desc || '', 5000);

    // Only valid rows claim their model number (an invalid row is skipped, so it is no duplicate).
    const key = model.toLowerCase();
    const duplicateRow = !errors.length ? seenRows.get(key) : undefined;
    if (!errors.length && !duplicateRow) seenRows.set(key, rowNumber);

    parsed.push({
      rowNumber,
      errors,
      duplicateRow,
      existing: !errors.length ? byModel.get(key) : undefined,
      item: {
        name,
        model,
        type: category?.id || '',
        price,
        unit,
        tierPrices: tierPrice ? [{ minQty: tierQty, priceUsd: tierPrice }] : undefined,
        spec: spec || undefined,
        desc: desc || undefined,
        inStock,
        featured,
        year,
        supplySpecs,
        images: images.length ? images : undefined,
        videoUrl: videoUrl || undefined,
        en
      }
    });
  });
  return { parsed, missingColumns };
}

/** Merges the English columns into a product's translations without dropping other languages. */
export function mergeEnglish(current: ProductTranslations | undefined, en: ProductImportItem['en']): ProductTranslations | undefined {
  const entries = Object.entries(en).filter(([, v]) => v);
  if (!entries.length) return current;
  return { ...(current || {}), en: { ...(current?.en || {}), ...Object.fromEntries(entries) } };
}

const DEFAULT_SUPPLY = {
  leadTime: '现货 / 24-48小时发货',
  moq: '请咨询',
  capacityLabel: '常备现货储备',
  baseLocation: '广州智造基地',
  packaging: '标准工业防护包装'
};

/** A new catalogue product from one row (the same fields the "添加商品" form writes). */
export function newProductFromRow(item: ProductImportItem): Omit<Product, 'id'> {
  const s = item.supplySpecs;
  return {
    nameKey: item.name,
    customName: item.name,
    type: item.type,
    catKey: item.type,
    model: item.model,
    descKey: item.desc || 'p1Desc',
    customDesc: item.desc,
    price: item.price,
    unitKey: item.type === 'equipment' ? 'p3Unit' : 'p1Unit',
    unit: item.unit,
    specKey: item.spec || '',
    customSpec: item.spec,
    inStock: item.inStock ?? true,
    status: item.inStock === false ? 'out_of_stock' : 'published',
    year: item.year || new Date().getFullYear(),
    brand: 'lym',
    condition: 'new',
    featured: item.featured ?? false,
    videoUrl: item.videoUrl,
    videoThumbnail: item.images?.[0],
    images: item.images || [],
    tierPrices: item.tierPrices || [],
    supplySpecs: {
      leadTime: s.leadTime || DEFAULT_SUPPLY.leadTime,
      moq: s.moq || DEFAULT_SUPPLY.moq,
      capacityStatus: 'ample',
      capacityLabel: s.capacityLabel || DEFAULT_SUPPLY.capacityLabel,
      baseLocation: s.baseLocation || DEFAULT_SUPPLY.baseLocation,
      packaging: s.packaging || DEFAULT_SUPPLY.packaging
    },
    translations: mergeEnglish(undefined, item.en)
  };
}

/**
 * An existing product updated from one row. Only the cells that are filled in change something;
 * an empty cell keeps the current value (so a sheet with just model + price updates prices only).
 */
export function updatedProductFromRow(existing: Product, item: ProductImportItem): Product {
  const s = item.supplySpecs;
  const supply = existing.supplySpecs || { leadTime: DEFAULT_SUPPLY.leadTime, moq: DEFAULT_SUPPLY.moq, capacityStatus: 'ample' as const };
  return {
    ...existing,
    customName: item.name,
    nameKey: item.name,
    type: item.type,
    catKey: item.type,
    price: item.price,
    unit: item.unit,
    ...(item.spec !== undefined ? { customSpec: item.spec, specKey: item.spec } : {}),
    ...(item.desc !== undefined ? { customDesc: item.desc, descKey: item.desc } : {}),
    ...(item.inStock !== undefined ? { inStock: item.inStock, status: item.inStock ? 'published' : 'out_of_stock' } : {}),
    ...(item.featured !== undefined ? { featured: item.featured } : {}),
    ...(item.year !== undefined ? { year: item.year } : {}),
    ...(item.tierPrices ? { tierPrices: item.tierPrices } : {}),
    ...(item.images ? { images: item.images, videoThumbnail: item.images[0] } : {}),
    ...(item.videoUrl ? { videoUrl: item.videoUrl } : {}),
    supplySpecs: {
      ...supply,
      ...Object.fromEntries(Object.entries(s).filter(([, v]) => v))
    },
    translations: mergeEnglish(existing.translations, item.en)
  };
}
