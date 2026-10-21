/**
 * Wording, units, Incoterms and number/date formatting for proforma invoices.
 * Kept free of React so the same rules serve the preview, the PDF and saved quotations.
 */
import { getCountryOptions } from '../../common/CountryPicker';
import { toCents } from '../../../utils/format';
import { UNITS, unitKeyFrom } from '../../../config/units';

export type PiLang = 'en' | 'bilingual' | 'ar' | 'ru';
/** Languages a single label exists in. */
type Tongue = 'en' | 'zh' | 'ar' | 'ru';

type Label = Record<Tongue, string>;

export const PI_LABELS = {
  title: { en: 'PROFORMA INVOICE', zh: '形式发票', ar: 'فاتورة مبدئية', ru: 'ПРОФОРМА-ИНВОЙС' },
  piNo: { en: 'PI No.', zh: '发票号', ar: 'رقم الفاتورة', ru: '№ инвойса' },
  date: { en: 'Date', zh: '日期', ar: 'التاريخ', ru: 'Дата' },
  validUntil: { en: 'Valid until', zh: '有效期至', ar: 'صالحة حتى', ru: 'Действительно до' },
  seller: { en: 'Seller', zh: '卖方', ar: 'البائع', ru: 'Продавец' },
  buyer: { en: 'Buyer', zh: '买方', ar: 'المشتري', ru: 'Покупатель' },
  attn: { en: 'Attn.', zh: '联系人', ar: 'عناية', ru: 'Контакт' },
  contact: { en: 'Tel / Email', zh: '电话 / 邮箱', ar: 'الهاتف / البريد', ru: 'Тел. / Email' },
  address: { en: 'Address', zh: '地址', ar: 'العنوان', ru: 'Адрес' },
  destination: { en: 'Destination', zh: '目的地', ar: 'الوجهة', ru: 'Пункт назначения' },
  terms: { en: 'Terms of sale', zh: '贸易条款', ar: 'شروط البيع', ru: 'Условия поставки' },
  priceTerm: { en: 'Price term', zh: '价格条款', ar: 'شرط السعر', ru: 'Базис поставки' },
  portLoading: { en: 'Port of loading', zh: '起运港', ar: 'ميناء الشحن', ru: 'Порт отгрузки' },
  portDischarge: { en: 'Port of discharge', zh: '目的港', ar: 'ميناء الوصول', ru: 'Порт выгрузки' },
  payment: { en: 'Payment', zh: '付款方式', ar: 'طريقة الدفع', ru: 'Оплата' },
  delivery: { en: 'Delivery time', zh: '交货期', ar: 'مدة التسليم', ru: 'Срок поставки' },
  packing: { en: 'Packing', zh: '包装', ar: 'التعبئة', ru: 'Упаковка' },
  origin: { en: 'Origin', zh: '原产地', ar: 'بلد المنشأ', ru: 'Происхождение' },
  originValue: { en: 'China', zh: '中国', ar: 'الصين', ru: 'Китай' },
  colNo: { en: 'No.', zh: '序号', ar: 'م', ru: '№' },
  colItem: { en: 'Description', zh: '品名及规格', ar: 'الوصف', ru: 'Наименование' },
  colModel: { en: 'Model', zh: '型号', ar: 'الموديل', ru: 'Модель' },
  colQty: { en: 'Qty', zh: '数量', ar: 'الكمية', ru: 'Кол-во' },
  colPrice: { en: 'Unit price', zh: '单价', ar: 'سعر الوحدة', ru: 'Цена' },
  colAmount: { en: 'Amount', zh: '金额', ar: 'المبلغ', ru: 'Сумма' },
  subtotal: { en: 'Goods subtotal', zh: '货值小计', ar: 'قيمة البضاعة', ru: 'Стоимость товара' },
  freight: { en: 'Ocean freight', zh: '海运费', ar: 'الشحن البحري', ru: 'Морской фрахт' },
  insurance: { en: 'Insurance', zh: '保险费', ar: 'التأمين', ru: 'Страхование' },
  discount: { en: 'Discount', zh: '折扣', ar: 'الخصم', ru: 'Скидка' },
  total: { en: 'Total', zh: '总计', ar: 'الإجمالي', ru: 'Итого' },
  deposit: { en: 'Deposit', zh: '定金', ar: 'الدفعة المقدمة', ru: 'Предоплата' },
  balance: { en: 'Balance', zh: '尾款', ar: 'الرصيد المتبقي', ru: 'Остаток' },
  inWords: { en: 'Amount in words', zh: '金额大写', ar: 'المبلغ كتابةً', ru: 'Сумма прописью' },
  bank: { en: 'Bank information', zh: '收款银行信息', ar: 'البيانات البنكية', ru: 'Банковские реквизиты' },
  beneficiary: { en: 'Beneficiary', zh: '收款人', ar: 'المستفيد', ru: 'Получатель' },
  bankName: { en: 'Bank', zh: '开户行', ar: 'البنك', ru: 'Банк' },
  bankAddress: { en: 'Bank address', zh: '银行地址', ar: 'عنوان البنك', ru: 'Адрес банка' },
  account: { en: 'Account No.', zh: '账号', ar: 'رقم الحساب', ru: 'Счёт' },
  swift: { en: 'SWIFT', zh: 'SWIFT', ar: 'SWIFT', ru: 'SWIFT' },
  bankLater: {
    en: 'Bank details will be provided separately upon order confirmation.',
    zh: '收款银行信息将在订单确认后另行提供。',
    ar: 'سيتم تزويدكم بالبيانات البنكية بعد تأكيد الطلب.',
    ru: 'Банковские реквизиты будут предоставлены после подтверждения заказа.'
  },
  remarks: { en: 'Remarks', zh: '备注', ar: 'ملاحظات', ru: 'Примечания' },
  sellerSign: { en: 'For and on behalf of the seller', zh: '卖方签章', ar: 'توقيع وختم البائع', ru: 'Подпись и печать продавца' },
  buyerSign: { en: "Buyer's confirmation", zh: '买方确认签章', ar: 'تأكيد المشتري', ru: 'Подтверждение покупателя' },
  days: { en: 'days', zh: '天', ar: 'يومًا', ru: 'дн.' }
} satisfies Record<string, Label>;

export type PiLabelKey = keyof typeof PI_LABELS;

/** The label in the document's language; bilingual documents get [English, Chinese]. */
export function piLabel(key: PiLabelKey, lang: PiLang): [string, string?] {
  const l = PI_LABELS[key];
  if (lang === 'bilingual') return l.en === l.zh ? [l.en] : [l.en, l.zh];
  return [l[lang]];
}

export const piDir = (lang: PiLang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** The shared unit list (src/config/units.ts); quotations and the product catalogue use the same units. */
export const PI_UNITS = UNITS;
export { unitKeyFrom };

export function unitLabel(key: string, lang: PiLang): string {
  const u = PI_UNITS.find(x => x.key === key);
  if (!u) return key;
  return lang === 'bilingual' ? u.label.en : u.label[lang];
}

// ---------------------------------------------------------------------------
// Incoterms
// ---------------------------------------------------------------------------

export const INCOTERMS: { key: string; zh: string; /** Named place is the destination (seller pays main carriage). */ toDestination: boolean; freight: boolean; insurance: boolean }[] = [
  { key: 'EXW', zh: '工厂交货', toDestination: false, freight: false, insurance: false },
  { key: 'FOB', zh: '装运港船上交货', toDestination: false, freight: false, insurance: false },
  { key: 'CFR', zh: '成本加运费', toDestination: true, freight: true, insurance: false },
  { key: 'CIF', zh: '成本、保险费加运费', toDestination: true, freight: true, insurance: true },
  { key: 'DAP', zh: '目的地交货', toDestination: true, freight: true, insurance: false }
];

export const incotermDef = (key: string) => INCOTERMS.find(i => i.key === key) || INCOTERMS[1];

/** "FOB Guangzhou" / "CIF Jebel Ali" — the term followed by its named place. */
export function priceTermText(incoterm: string, portOfLoading: string, portOfDischarge: string): string {
  const def = incotermDef(incoterm);
  const place = (def.toDestination ? portOfDischarge : portOfLoading).trim();
  return place ? `${def.key} ${place}` : def.key;
}

// ---------------------------------------------------------------------------
// Numbers & dates
// ---------------------------------------------------------------------------

/** Cents, rounded half away from zero (see toCents). */
export const round2 = toCents;

/** "12,420.00" — always two decimals, Latin digits and a comma grouping in every language. */
export function money(n: number): string {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Quantities keep up to three decimals and drop trailing zeros: 2.5, 20, 0.125. */
export function qty(n: number): string {
  return (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** yyyy-mm-dd in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, (m || 1) - 1, (d || 1) + days));
}

/**
 * "19 Oct 2026" style dates that cannot be misread as month/day or day/month.
 * Non-ISO strings (quotations saved before v14) are shown as they were stored.
 */
export function piDate(value: string, lang: PiLang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return value || '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Amount in words
// ---------------------------------------------------------------------------

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

function integerWords(n: number): string {
  if (n === 0) return 'ZERO';
  const scales = ['', 'THOUSAND', 'MILLION', 'BILLION'];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${under1000(chunk)}${scales[i] ? ` ${scales[i]}` : ''}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}

/** "SAY US DOLLARS TWELVE THOUSAND FOUR HUNDRED TWENTY AND CENTS FIFTY ONLY." */
export function usdInWords(amount: number): string {
  const cents = Math.round(round2(amount) * 100);
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `SAY US DOLLARS ${integerWords(dollars)}${rest ? ` AND CENTS ${integerWords(rest)}` : ''} ONLY.`;
}

const CN_DIGITS = '零壹贰叁肆伍陆柒捌玖';
const CN_UNITS = ['', '拾', '佰', '仟'];
const CN_SECTIONS = ['', '万', '亿'];

/** 美元壹万贰仟肆佰贰拾元伍角整 — the Chinese capital-amount form used on commercial documents. */
export function usdInChineseCapitals(amount: number): string {
  const cents = Math.round(round2(amount) * 100);
  let n = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;
  let intPart = '';
  if (n === 0) intPart = '零';
  let section = 0;
  let needZero = false;
  while (n > 0) {
    const chunk = n % 10000;
    let s = '';
    let zero = false;
    for (let i = 0, c = chunk; i < 4; i++, c = Math.floor(c / 10)) {
      const d = c % 10;
      if (d === 0) {
        if (s) zero = true;
      } else {
        s = CN_DIGITS[d] + CN_UNITS[i] + (zero ? '零' : '') + s;
        zero = false;
      }
    }
    if (s) {
      intPart = s + CN_SECTIONS[section] + (needZero && intPart ? '零' : '') + intPart;
    }
    needZero = chunk < 1000;
    n = Math.floor(n / 10000);
    section++;
  }
  let frac = '';
  if (jiao) frac += `${CN_DIGITS[jiao]}角`;
  if (fen) frac += `${jiao ? '' : '零'}${CN_DIGITS[fen]}分`;
  return `美元${intPart}元${frac || '整'}`;
}

// ---------------------------------------------------------------------------
// Text checks & country names
// ---------------------------------------------------------------------------

export const hasChinese = (s: string | undefined) => /[㐀-鿿]/.test(s || '');

/**
 * A country typed in Chinese (often copied from a lead, e.g. "阿联酋") in the document's language.
 * Unknown text (a city, a typo) is returned unchanged so the editor can flag it.
 */
export function countryForDocument(text: string, lang: PiLang): string {
  const v = (text || '').trim();
  if (!v || !hasChinese(v) || lang === 'bilingual') return v;
  const zh = getCountryOptions('zh').find(c => c.name === v || v === c.name.replace(/（.*）|\(.*\)/g, ''));
  if (!zh) return v;
  const target = getCountryOptions(lang === 'ar' ? 'ar' : lang === 'ru' ? 'ru' : 'en').find(c => c.iso === zh.iso);
  return target?.name || v;
}
