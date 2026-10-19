import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { sanitizeQuotationConfigForFirestore } from '../utils/firestoreSanitizer';

/**
 * Seller details and default terms printed on proforma invoices (site_config/quotation).
 * Staff-only like the bank details: the company stamp must never be readable by visitors.
 */
export interface QuotationConfig {
  companyNameEn: string;
  companyNameZh: string;
  addressEn: string;
  /** Empty = use the official phone / email from the website contact settings. */
  phone: string;
  email: string;
  website: string;
  /** PNG data URL of the company stamp or signature (transparent background), optional. */
  stampImage: string;
  defaultIncoterm: string;
  defaultPortOfLoading: string;
  defaultPaymentTerms: string;
  defaultDepositPercent: number;
  defaultDeliveryTime: string;
  defaultValidityDays: number;
  defaultPacking: string;
  /** Standard terms printed under Remarks on every quotation (one per line). */
  standardTerms: string;
  updatedAt?: string;
}

/** Shown until a super admin saves the real details — the console warns while these are in use. */
export const DEFAULT_QUOTATION_CONFIG: QuotationConfig = {
  companyNameEn: 'GUANGZHOU LUYIMEI ENGINEERING EQUIPMENT CO., LTD.',
  companyNameZh: '广州路易美工程设备有限公司',
  addressEn: 'Huangpu District, Guangzhou, Guangdong, China',
  phone: '',
  email: '',
  website: '',
  stampImage: '',
  defaultIncoterm: 'FOB',
  defaultPortOfLoading: 'Guangzhou, China',
  defaultPaymentTerms: '30% T/T deposit in advance, 70% balance before shipment',
  defaultDepositPercent: 30,
  defaultDeliveryTime: '15-20 days after receipt of deposit',
  defaultValidityDays: 30,
  defaultPacking: 'Standard export packing',
  standardTerms: ''
};

export const STAMP_MAX_CHARS = 300_000;

function fromDoc(data: Partial<QuotationConfig>): QuotationConfig {
  const d = DEFAULT_QUOTATION_CONFIG;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    companyNameEn: str(data.companyNameEn, d.companyNameEn) || d.companyNameEn,
    companyNameZh: str(data.companyNameZh, d.companyNameZh),
    addressEn: str(data.addressEn, d.addressEn),
    phone: str(data.phone, ''),
    email: str(data.email, ''),
    website: str(data.website, ''),
    stampImage: str(data.stampImage, ''),
    defaultIncoterm: str(data.defaultIncoterm, d.defaultIncoterm) || d.defaultIncoterm,
    defaultPortOfLoading: str(data.defaultPortOfLoading, d.defaultPortOfLoading),
    defaultPaymentTerms: str(data.defaultPaymentTerms, d.defaultPaymentTerms),
    defaultDepositPercent: num(data.defaultDepositPercent, d.defaultDepositPercent),
    defaultDeliveryTime: str(data.defaultDeliveryTime, d.defaultDeliveryTime),
    defaultValidityDays: num(data.defaultValidityDays, d.defaultValidityDays),
    defaultPacking: str(data.defaultPacking, d.defaultPacking),
    standardTerms: str(data.standardTerms, ''),
    updatedAt: data.updatedAt
  };
}

/** Live quotation settings. `saved` is false while the built-in placeholders are in use. */
export function useQuotationConfig(): { config: QuotationConfig; saved: boolean; loading: boolean } {
  const [state, setState] = useState({ config: DEFAULT_QUOTATION_CONFIG, saved: false, loading: true });
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'site_config', 'quotation'),
        snap => setState({ config: fromDoc((snap.exists() ? snap.data() : {}) as Partial<QuotationConfig>), saved: snap.exists(), loading: false }),
        () => setState(s => ({ ...s, loading: false }))
      ),
    []
  );
  return state;
}

export async function saveQuotationConfig(next: QuotationConfig): Promise<void> {
  if (!next.companyNameEn.trim()) throw new Error('请填写公司英文名称');
  if (next.stampImage.length > STAMP_MAX_CHARS) throw new Error('印章图片太大，请换一张小一些的图片');
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
  const payload: Record<string, unknown> = {
    companyNameEn: next.companyNameEn.trim(),
    companyNameZh: next.companyNameZh.trim(),
    addressEn: next.addressEn.trim(),
    phone: next.phone.trim(),
    email: next.email.trim(),
    website: next.website.trim(),
    stampImage: next.stampImage,
    defaultIncoterm: next.defaultIncoterm,
    defaultPortOfLoading: next.defaultPortOfLoading.trim(),
    defaultPaymentTerms: next.defaultPaymentTerms.trim(),
    defaultDepositPercent: clamp(next.defaultDepositPercent, 0, 100),
    defaultDeliveryTime: next.defaultDeliveryTime.trim(),
    defaultValidityDays: clamp(next.defaultValidityDays, 1, 365),
    defaultPacking: next.defaultPacking.trim(),
    standardTerms: next.standardTerms.trim(),
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'site_config', 'quotation'), sanitizeQuotationConfigForFirestore(payload));
}
