import { QuotationSheet } from '../../../types/admin';
import { QuotationConfig } from '../../../config/quotationConfig';
import { PiLang, incotermDef, round2 } from './piText';

/** Everything printed on one proforma invoice. The sheet renders only from this. */
export interface PiDocument {
  lang: PiLang;
  number: string;
  /** yyyy-mm-dd (older quotations: whatever was stored). */
  date: string;
  validUntil: string;
  validDays?: number;
  seller: { nameEn: string; nameZh: string; address: string; phone: string; email: string; website: string };
  logoUrl: string;
  stampImage: string;
  buyer: { company: string; name: string; contact: string; address: string; destination: string };
  incoterm: string;
  portOfLoading: string;
  portOfDischarge: string;
  payment: string;
  deliveryTime: string;
  packing: string;
  items: PiLine[];
  subtotal: number;
  freight: number;
  insurance: number;
  discount: number;
  total: number;
  depositPercent: number;
  bank: { beneficiary: string; bankName: string; bankAddress: string; accountNumber: string; swiftCode: string; remarks: string } | null;
  remarks: string;
  standardTerms: string;
}

export interface PiLine {
  model: string;
  name: string;
  nameZh: string;
  spec: string;
  specZh: string;
  unit: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
}

export function totalsFor(items: { amountUsd: number }[], freight: number, insurance: number, discount: number) {
  const subtotal = round2(items.reduce((s, i) => s + Math.max(0, i.amountUsd), 0));
  const total = round2(Math.max(0, subtotal + Math.max(0, freight) + Math.max(0, insurance) - Math.max(0, discount)));
  return { subtotal, total };
}

/**
 * Rebuilds the document of an issued quotation. Quotations issued before v14 have no `details`;
 * their seller and terms come from the current settings and their old free-text fields.
 */
export function documentFromQuotation(q: QuotationSheet, cfg: QuotationConfig, contact: { phone: string; email: string }, logoUrl: string): PiDocument {
  const d = q.details || {};
  const legacyTerm = /\b(EXW|FOB|CFR|CIF|DAP)\b/.exec(q.portOfLoading || '')?.[1];
  const incoterm = d.incoterm || legacyTerm || 'FOB';
  const items: PiLine[] = q.items.map(i => ({
    model: i.model,
    name: i.name || i.productName,
    nameZh: i.nameZh || '',
    spec: i.spec || '',
    specZh: i.specZh || '',
    unit: i.unit,
    quantity: i.quantity,
    unitPriceUsd: i.unitPriceUsd,
    amountUsd: i.amountUsd
  }));
  const freight = d.freightUsd || 0;
  const insurance = d.insuranceUsd || 0;
  const discount = d.discountUsd || 0;
  return {
    lang: q.lang || 'bilingual',
    number: q.quotationNumber,
    date: q.date,
    validUntil: q.validUntil,
    seller: d.seller || {
      nameEn: cfg.companyNameEn,
      nameZh: cfg.companyNameZh,
      address: cfg.addressEn,
      phone: cfg.phone || contact.phone,
      email: cfg.email || contact.email,
      website: cfg.website
    },
    logoUrl,
    stampImage: cfg.stampImage,
    buyer: { company: q.clientCompany, name: q.clientName, contact: d.clientContact || '', address: d.clientAddress || '', destination: q.clientCountry },
    incoterm,
    portOfLoading: legacyTerm ? q.portOfLoading.replace(/\(?\b(EXW|FOB|CFR|CIF|DAP)\b\)?/, '').trim() : q.portOfLoading,
    portOfDischarge: d.portOfDischarge || '',
    payment: q.paymentTerms,
    deliveryTime: d.deliveryTime || '',
    packing: d.packing || '',
    items,
    subtotal: d.subtotalUsd ?? round2(items.reduce((s, i) => s + i.amountUsd, 0)),
    freight,
    insurance,
    discount,
    total: q.totalAmountUsd,
    depositPercent: d.depositPercent ?? 0,
    bank: d.bank && d.bank.accountNumber ? d.bank : null,
    // Pre-v14 quotations stored a fixed FOB sentence here; it is not shown again.
    remarks: q.details ? q.notes : '',
    standardTerms: d.standardTerms || ''
  };
}

/** Whether the selected Incoterm prints freight / insurance lines. */
export const showsFreight = (incoterm: string, freight: number) => incotermDef(incoterm).freight || freight > 0;
export const showsInsurance = (incoterm: string, insurance: number) => incotermDef(incoterm).insurance || insurance > 0;
