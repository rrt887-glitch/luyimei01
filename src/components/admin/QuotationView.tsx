import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getProductCategories } from '../../config/categories';
import { Product, SupportedLanguage } from '../../types';
import { adminApi } from '../../services/adminApi';
import { QuotationSheet, AdminLead, QuotationItem } from '../../types/admin';
import { useSiteContactConfig } from '../../config/whatsapp';
import { generateQuotationNumber } from '../../services/admin/quotationService';
import { Printer, Download, Loader2, Plus, Trash2, CheckCircle2, ExternalLink, RefreshCw, FileText, Settings2, AlertTriangle, Eye } from 'lucide-react';
import { PageHeader, Panel, FormField, EmptyState, Modal } from './AdminUI';
import { formatDateTime } from '../../utils/format';
import { useBillingConfig, isBillingConfigured } from '../../config/billing';
import { useQuotationConfig } from '../../config/quotationConfig';
import { localizeProduct } from '../../utils/productText';
import { zh as dictZh } from '../../i18n/locales/zh';
import { en as dictEn } from '../../i18n/locales/en';
import { ar as dictAr } from '../../i18n/locales/ar';
import { ru as dictRu } from '../../i18n/locales/ru';
import logoUrl from '../../assets/brand/logo.svg';
import { INCOTERMS, PI_UNITS, PiLang, addDays, countryForDocument, hasChinese, incotermDef, isoDate, money, round2, unitKeyFrom } from './quotation/piText';
import { PiDocument, PiLine, documentFromQuotation, totalsFor } from './quotation/piDocument';
import { SheetPreview } from './quotation/SheetPreview';
import { printSheet, renderPdf } from './quotation/piOutput';
import { QuotationSettingsModal } from './quotation/QuotationSettingsModal';

interface QuotationViewProps {
  products: Product[];
  leads?: AdminLead[];
  initialLeadId?: string | null;
  onClearInitialLeadId?: () => void;
  onRefreshData?: () => void;
  onShowToast: (msg: string) => void;
}

/** A line being edited. Name and spec follow the product and the document language unless overridden. */
interface EditorLine {
  key: string;
  productId: string;
  model: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPriceUsd: number;
  nameOverride?: string;
  specOverride?: string;
}

const DICTS: Record<SupportedLanguage, any> = { zh: dictZh, en: dictEn, ar: dictAr, ru: dictRu };

const LANG_OPTIONS: { key: PiLang; label: string }[] = [
  { key: 'bilingual', label: '中英' },
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
  { key: 'ru', label: 'Русский' }
];

/** Name and spec lines of a product in the document language (bilingual = English + Chinese). */
function productText(p: Product | undefined, lang: PiLang): { name: string; nameZh: string; spec: string; specZh: string } {
  if (!p) return { name: '', nameZh: '', spec: '', specZh: '' };
  const cats = getProductCategories();
  const main = localizeProduct(p, lang === 'bilingual' ? 'en' : lang, DICTS[lang === 'bilingual' ? 'en' : lang], cats);
  const zhText = localizeProduct(p, 'zh', DICTS.zh, cats);
  const specOf = (t: typeof main, packLabel: string) => [t.spec, t.packaging && `${packLabel}: ${t.packaging}`].filter(Boolean).join('\n');
  const packLabel = { bilingual: 'Packing', en: 'Packing', ar: 'التعبئة', ru: 'Упаковка' }[lang];
  return {
    name: main.name,
    nameZh: lang === 'bilingual' ? zhText.name : '',
    spec: specOf(main, packLabel),
    specZh: lang === 'bilingual' ? specOf(zhText, '包装') : ''
  };
}

const firstPrice = (price: string) => {
  const m = (price || '').match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
};

const num = (v: string, min = 0) => Math.max(min, Number.parseFloat(v) || 0);

export const QuotationView: React.FC<QuotationViewProps> = ({ products, leads: propsLeads, initialLeadId, onClearInitialLeadId, onRefreshData, onShowToast }) => {
  const contactCfg = useSiteContactConfig();
  const { billing, loading: billingLoading } = useBillingConfig();
  const billingReady = isBillingConfigured(billing);
  const { config, saved: configSaved, loading: configLoading } = useQuotationConfig();
  const isSuperAdmin = adminApi.getCurrentStaff()?.role === 'super_admin';

  const [lang, setLang] = useState<PiLang>('bilingual');
  const [linkedLeadId, setLinkedLeadId] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [destination, setDestination] = useState('');

  const [incoterm, setIncoterm] = useState(config.defaultIncoterm);
  const [portOfLoading, setPortOfLoading] = useState(config.defaultPortOfLoading);
  const [portOfDischarge, setPortOfDischarge] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(config.defaultPaymentTerms);
  const [depositPercent, setDepositPercent] = useState(config.defaultDepositPercent);
  const [deliveryTime, setDeliveryTime] = useState(config.defaultDeliveryTime);
  const [validDays, setValidDays] = useState(config.defaultValidityDays);
  const [packing, setPacking] = useState(config.defaultPacking);
  const [remarks, setRemarks] = useState('');
  const [freight, setFreight] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [discount, setDiscount] = useState(0);

  // Defaults arrive from Firestore after the first render; apply them once, unless already edited.
  const termsTouched = useRef(false);
  useEffect(() => {
    if (configLoading || termsTouched.current) return;
    setIncoterm(config.defaultIncoterm);
    setPortOfLoading(config.defaultPortOfLoading);
    setPaymentTerms(config.defaultPaymentTerms);
    setDepositPercent(config.defaultDepositPercent);
    setDeliveryTime(config.defaultDeliveryTime);
    setValidDays(config.defaultValidityDays);
    setPacking(config.defaultPacking);
  }, [config, configLoading]);
  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    termsTouched.current = true;
    setter(v);
  };

  const [items, setItems] = useState<EditorLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState('Ton');
  const [addPrice, setAddPrice] = useState('');

  const [quotationNumber, setQuotationNumber] = useState(() => generateQuotationNumber());
  const [today] = useState(() => isoDate(new Date()));
  const [recentQuotations, setRecentQuotations] = useState<QuotationSheet[]>(() => adminApi.getQuotations());
  useEffect(() => adminApi.subscribeToQuotations(setRecentQuotations), []);

  const [busy, setBusy] = useState(false);
  const [lastPdf, setLastPdf] = useState<{ url: string; filename: string; sizeKb: number; time: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewing, setViewing] = useState<QuotationSheet | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const historyOutputRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => (lastPdf ? URL.revokeObjectURL(lastPdf.url) : undefined), [lastPdf]);

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------
  const defaultsFor = (p: Product) => {
    const zhUnit = localizeProduct(p, 'zh', DICTS.zh, getProductCategories()).unit;
    const unit = unitKeyFrom(p.unit) || unitKeyFrom(zhUnit) || unitKeyFrom(zhUnit.split('/').pop()) || (p.type === 'equipment' ? 'Set' : 'Unit');
    return { unit, price: firstPrice(p.price) };
  };

  const selectProduct = (id: string) => {
    setSelectedProductId(id);
    const p = products.find(x => x.id === id);
    if (!p) return;
    const d = defaultsFor(p);
    setAddUnit(d.unit);
    setAddPrice(d.price ? String(d.price) : '');
  };

  useEffect(() => {
    if (!selectedProductId && products[0]) selectProduct(products[0].id);
    else if (selectedProductId && addPrice === '' && products.find(p => p.id === selectedProductId)) selectProduct(selectedProductId);
    // Only when the catalogue first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const addItem = () => {
    const p = products.find(x => x.id === selectedProductId);
    if (!p) return;
    const price = round2(num(addPrice));
    const quantity = Math.round(num(addQty) * 1000) / 1000;
    if (price <= 0) {
      onShowToast(`「${p.customName || p.model}」没有标价，请先填写单价`);
      return;
    }
    if (quantity <= 0) {
      onShowToast('数量要大于 0');
      return;
    }
    const zhName = localizeProduct(p, 'zh', DICTS.zh, getProductCategories()).name;
    setItems(prev => [
      ...prev,
      { key: `${p.id}-${Date.now()}`, productId: p.id, model: p.model, productName: zhName, unit: addUnit, quantity, unitPriceUsd: price }
    ]);
    onShowToast(`已添加 ${p.model}`);
  };

  const updateItem = (key: string, patch: Partial<EditorLine>) => setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems(prev => prev.filter(i => i.key !== key));
  const moveItem = (index: number, delta: number) =>
    setItems(prev => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const lines: PiLine[] = useMemo(
    () =>
      items.map(i => {
        const t = productText(
          products.find(p => p.id === i.productId),
          lang
        );
        return {
          model: i.model,
          name: i.nameOverride ?? (t.name || i.productName),
          nameZh: t.nameZh,
          spec: i.specOverride ?? t.spec,
          specZh: t.specZh,
          unit: i.unit,
          quantity: i.quantity,
          unitPriceUsd: i.unitPriceUsd,
          amountUsd: round2(i.unitPriceUsd * i.quantity)
        };
      }),
    [items, products, lang]
  );

  const term = incotermDef(incoterm);
  const effFreight = term.freight ? freight : 0;
  const effInsurance = term.insurance ? insurance : 0;
  const { subtotal, total } = totalsFor(lines, effFreight, effInsurance, discount);

  // ---------------------------------------------------------------------------
  // Leads
  // ---------------------------------------------------------------------------
  const leads = propsLeads || adminApi.getLeads();
  const fillFromLead = (lead: AdminLead) => {
    setLinkedLeadId(lead.id);
    setClientName(lead.customerName);
    // Never invent a company name: an empty field is better than a made-up one on an invoice.
    setClientCompany((lead.company || '').trim());
    setClientContact([lead.phone, lead.buyerEmail].filter(Boolean).join(' / '));
    setDestination(lead.location || '');
  };
  const handleLeadSelect = (leadId: string) => {
    if (!leadId) {
      setLinkedLeadId('');
      onShowToast('已取消关联，这张报价单不会更新线索');
      return;
    }
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    fillFromLead(lead);
    onShowToast(`已关联线索，开具后会更新它的估值和阶段`);
  };
  useEffect(() => {
    if (!initialLeadId) return;
    const matched = leads.find(l => l.id === initialLeadId);
    if (matched) {
      fillFromLead(matched);
      onClearInitialLeadId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadId, leads, onClearInitialLeadId]);

  // ---------------------------------------------------------------------------
  // The document
  // ---------------------------------------------------------------------------
  const seller = {
    nameEn: config.companyNameEn,
    nameZh: config.companyNameZh,
    address: config.addressEn,
    phone: config.phone || contactCfg.hotlinePhone || '',
    email: config.email || contactCfg.officialEmail || '',
    website: config.website
  };
  const bank = billingReady
    ? {
        beneficiary: billing.beneficiary,
        bankName: billing.bankName,
        bankAddress: billing.bankAddress,
        accountNumber: billing.accountNumber,
        swiftCode: billing.swiftCode,
        remarks: billing.remarks
      }
    : null;
  const validUntil = addDays(today, Math.max(1, Math.round(validDays) || 1));
  const doc: PiDocument = {
    lang,
    number: quotationNumber,
    date: today,
    validUntil,
    validDays: Math.max(1, Math.round(validDays) || 1),
    seller,
    logoUrl,
    stampImage: config.stampImage,
    buyer: { company: clientCompany.trim(), name: clientName.trim(), contact: clientContact.trim(), address: clientAddress.trim(), destination: destination.trim() },
    incoterm,
    portOfLoading: portOfLoading.trim(),
    portOfDischarge: portOfDischarge.trim(),
    payment: paymentTerms.trim(),
    deliveryTime: deliveryTime.trim(),
    packing: packing.trim(),
    items: lines,
    subtotal,
    freight: effFreight,
    insurance: effInsurance,
    discount,
    total,
    depositPercent,
    bank,
    remarks: remarks.trim(),
    standardTerms: config.standardTerms
  };

  // Problems that block issuing, and things worth a second look.
  const blockers: string[] = [];
  if (!clientCompany.trim() && !clientName.trim()) blockers.push('填写客户公司或联系人');
  if (items.length === 0) blockers.push('至少添加一个商品');
  if (items.some(i => i.quantity <= 0 || i.unitPriceUsd <= 0)) blockers.push('每个商品的数量和单价都要大于 0');
  const warnings: string[] = [];
  if (lang !== 'bilingual') {
    const fields: [string, string][] = [
      ['客户公司', clientCompany],
      ['联系人', clientName],
      ['客户地址', clientAddress],
      ['目的地', countryForDocument(destination, lang)],
      ['起运港', portOfLoading],
      ['目的港', portOfDischarge],
      ['付款方式', paymentTerms],
      ['交货期', deliveryTime],
      ['包装', packing],
      ['备注', remarks]
    ];
    const zhFields = fields.filter(([, v]) => hasChinese(v)).map(([k]) => k);
    if (zhFields.length) warnings.push(`${zhFields.join('、')} 里有中文，会原样印在${LANG_OPTIONS.find(o => o.key === lang)?.label}报价单上`);
    const zhItems = lines.filter(l => hasChinese(l.name) || hasChinese(l.spec) || hasChinese(l.model)).map(l => l.model);
    if (zhItems.length) warnings.push(`${zhItems.join('、')} 的名称、型号或规格里有中文，可在下方商品里改名称和规格，或到商品管理补充翻译和英文型号`);
  }
  if (term.freight && items.length > 0 && freight <= 0) warnings.push(`${incoterm} 需要报海运费，目前是 0`);
  if (term.toDestination && !portOfDischarge.trim()) warnings.push(`${incoterm} 要写目的港`);
  if (!configLoading && !configSaved) warnings.push('公司名称、地址还没在「报价单设置」里确认，现在印的是系统默认值');

  // ---------------------------------------------------------------------------
  // Issue / download / print
  // ---------------------------------------------------------------------------
  const savedItems = (): QuotationItem[] =>
    items.map((i, idx) => ({
      productId: i.productId,
      productName: i.productName,
      model: i.model,
      name: lines[idx].name,
      nameZh: lines[idx].nameZh,
      spec: lines[idx].spec,
      specZh: lines[idx].specZh,
      unitPriceUsd: i.unitPriceUsd,
      quantity: i.quantity,
      unit: i.unit,
      amountUsd: lines[idx].amountUsd
    }));

  const issue = async (): Promise<{ alreadyIssued: boolean; crmSynced: boolean } | null> => {
    if (blockers.length) {
      onShowToast(`还不能开具：${blockers.join('；')}`);
      return null;
    }
    try {
      const res = await adminApi.issueQuotation({
        quotationNumber,
        leadId: linkedLeadId || undefined,
        clientName: clientName.trim() || clientCompany.trim(),
        clientCompany: clientCompany.trim(),
        clientCountry: countryForDocument(destination, lang),
        date: today,
        validUntil,
        portOfLoading: doc.portOfLoading,
        paymentTerms: doc.payment,
        currency: 'USD',
        items: savedItems(),
        totalAmountUsd: total,
        notes: doc.remarks,
        lang,
        details: {
          incoterm,
          portOfDischarge: doc.portOfDischarge,
          deliveryTime: doc.deliveryTime,
          packing: doc.packing,
          clientContact: doc.buyer.contact,
          clientAddress: doc.buyer.address,
          subtotalUsd: subtotal,
          freightUsd: effFreight,
          insuranceUsd: effInsurance,
          discountUsd: discount,
          depositPercent,
          standardTerms: config.standardTerms,
          seller,
          ...(bank ? { bank } : {})
        }
      });
      if (res.crmSynced) onRefreshData?.();
      return res;
    } catch (err) {
      onShowToast(`报价单保存失败：${(err as Error).message}`);
      return null;
    }
  };

  const pdfName = (company: string, number: string) =>
    `Proforma_Invoice_${(company || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Client'}_${number}.pdf`;

  /** Renders, downloads once, and keeps the file for "download again" / "open". */
  const downloadPdf = async (sheet: HTMLElement, number: string, company: string) => {
    const blob = await renderPdf(sheet, number);
    const filename = pdfName(company, number);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
    setLastPdf({ url, filename, sizeKb: Math.max(1, Math.round(blob.size / 1024)), time: new Date().toLocaleTimeString() });
    return filename;
  };

  const handleDownload = async () => {
    if (!outputRef.current || busy) return;
    setBusy(true);
    const number = quotationNumber;
    const issued = await issue();
    if (!issued) {
      setBusy(false);
      return;
    }
    try {
      const filename = await downloadPdf(outputRef.current, number, clientCompany || clientName);
      adminApi.addAuditLog('下载报价单 PDF', filename, `报价单 ${number}｜客户 ${clientCompany || clientName}｜金额 $${money(total)}`);
      onShowToast(
        issued.alreadyIssued
          ? `已重新下载 ${filename}（这个单号之前开过，不会重复更新线索）`
          : issued.crmSynced
          ? `已开具 ${filename}，关联线索已更新为「已报价」，估值 $${money(total)}`
          : `已开具 ${filename}`
      );
    } catch (err) {
      console.error('PDF export failed:', err);
      onShowToast('生成 PDF 失败，已改用打印：在打印窗口选「另存为 PDF」');
      printSheet(outputRef.current, pdfName(clientCompany || clientName, number).replace(/\.pdf$/, ''));
    } finally {
      setQuotationNumber(generateQuotationNumber());
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!outputRef.current || busy) return;
    const number = quotationNumber;
    const issued = await issue();
    if (!issued) return;
    printSheet(outputRef.current, pdfName(clientCompany || clientName, number).replace(/\.pdf$/, ''));
    adminApi.addAuditLog('打印报价单', number, `客户 ${clientCompany || clientName}｜金额 $${money(total)}`);
    onShowToast('在打印窗口把打印机选为「另存为 PDF」，得到的是可复制文字的 PDF');
    setQuotationNumber(generateQuotationNumber());
  };

  // Re-download / reprint an issued quotation exactly as it was issued.
  const viewingDoc = viewing
    ? documentFromQuotation(viewing, config, { phone: contactCfg.hotlinePhone || '', email: contactCfg.officialEmail || '' }, logoUrl)
    : null;
  const historyDownload = async () => {
    if (!viewing || !historyOutputRef.current || busy) return;
    setBusy(true);
    try {
      const filename = await downloadPdf(historyOutputRef.current, viewing.quotationNumber, viewing.clientCompany || viewing.clientName);
      adminApi.addAuditLog('重新下载报价单 PDF', filename, `报价单 ${viewing.quotationNumber}｜客户 ${viewing.clientCompany || viewing.clientName}`);
      onShowToast(`已下载 ${filename}`);
    } catch (err) {
      console.error('PDF export failed:', err);
      onShowToast('生成 PDF 失败，请改用打印');
    } finally {
      setBusy(false);
    }
  };
  const historyPrint = () => {
    if (!viewing || !historyOutputRef.current) return;
    printSheet(historyOutputRef.current, pdfName(viewing.clientCompany || viewing.clientName, viewing.quotationNumber).replace(/\.pdf$/, ''));
    adminApi.addAuditLog('打印报价单', viewing.quotationNumber, `重新打印｜客户 ${viewing.clientCompany || viewing.clientName}`);
  };

  const canIssue = blockers.length === 0;
  const terms = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <FormField label={label}>
      <input type="text" value={value} onChange={e => touch(set)(e.target.value)} placeholder={placeholder} className="field field-sm" />
    </FormField>
  );

  return (
    <div className="adm-page">
      <PageHeader
        title="报价单"
        description="填写客户和条款，添加商品，右侧就是客户收到的样子。开具时自动保存，并更新关联线索的估值和阶段。"
        actions={
          <>
            <button type="button" onClick={() => setSettingsOpen(true)} className="btn btn-sm btn-ghost">
              <Settings2 className="w-4 h-4" />
              报价单设置
            </button>
            <button type="button" onClick={handlePrint} disabled={busy || !canIssue} className="btn btn-sm btn-outline">
              <Printer className="w-4 h-4" />
              开具并打印
            </button>
            <button type="button" onClick={handleDownload} disabled={busy || !canIssue} className="btn btn-sm btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {busy ? '正在生成…' : '开具并下载 PDF'}
            </button>
          </>
        }
      />

      {lastPdf && (
        <div className="anim-pop mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="truncate">
              <strong className="font-semibold">{lastPdf.filename}</strong>
              <span className="text-emerald-800">　{lastPdf.sizeKb} KB，{lastPdf.time}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <a href={lastPdf.url} download={lastPdf.filename} className="btn btn-sm bg-emerald-700 text-white hover:bg-emerald-800">
              <Download className="w-4 h-4" />
              再次下载
            </a>
            <a href={lastPdf.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
              <ExternalLink className="w-4 h-4" />
              打开
            </a>
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)] items-start">
        {/* Editor */}
        <div className="space-y-4">
          <Panel title="客户">
            <div className="space-y-4">
              <FormField label="从线索带入" hint={linkedLeadId ? '开具后，这条线索的估值和阶段会自动更新。' : '可选。关联后会自动填写客户信息。'}>
                <select value={linkedLeadId} onChange={e => handleLeadSelect(e.target.value)} className="field field-sm">
                  <option value="">{linkedLeadId ? '不关联线索' : '选择线索…'}</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.customerName}
                      {l.company ? ` · ${l.company}` : ''}（{l.location || l.id}）
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="客户公司" hint="按客户营业执照上的名称填写，没有可留空。">
                <input type="text" value={clientCompany} onChange={e => setClientCompany(e.target.value)} className="field field-sm" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="联系人">
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="field field-sm" />
                </FormField>
                <FormField label="电话 / WhatsApp / 邮箱">
                  <input type="text" value={clientContact} onChange={e => setClientContact(e.target.value)} className="field field-sm" />
                </FormField>
              </div>
              <FormField label="客户地址">
                <input type="text" value={clientAddress} onChange={e => setClientAddress(e.target.value)} className="field field-sm" />
              </FormField>
              <FormField label="目的地（国家 / 城市）">
                <input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="United Arab Emirates" className="field field-sm" />
              </FormField>
            </div>
          </Panel>

          <Panel title="条款">
            <div className="space-y-4">
              <FormField label="单据语言">
                <div className="segmented w-full" role="group" aria-label="单据语言">
                  {LANG_OPTIONS.map(o => (
                    <button key={o.key} className="flex-1" aria-pressed={lang === o.key} onClick={() => setLang(o.key)} type="button">
                      {o.label}
                    </button>
                  ))}
                </div>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="价格条款">
                  <select value={incoterm} onChange={e => touch(setIncoterm)(e.target.value)} className="field field-sm">
                    {INCOTERMS.map(i => (
                      <option key={i.key} value={i.key}>
                        {i.key}（{i.zh}）
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="有效天数">
                  <input type="number" min={1} max={365} value={validDays} onChange={e => touch(setValidDays)(num(e.target.value, 1))} className="field field-sm font-sign" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {terms('起运港', portOfLoading, setPortOfLoading, 'Guangzhou, China')}
                {terms(term.toDestination ? '目的港（必填）' : '目的港', portOfDischarge, setPortOfDischarge, 'Jebel Ali, UAE')}
              </div>
              {terms('付款方式', paymentTerms, setPaymentTerms)}
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                {terms('交货期', deliveryTime, setDeliveryTime)}
                <FormField label="定金 %">
                  <input type="number" min={0} max={100} value={depositPercent} onChange={e => touch(setDepositPercent)(Math.min(100, num(e.target.value)))} className="field field-sm font-sign" />
                </FormField>
              </div>
              {terms('包装', packing, setPacking)}
            </div>
          </Panel>

          <Panel title="商品">
            <div className="space-y-4">
              <FormField label="选择商品">
                <select value={selectedProductId} onChange={e => selectProduct(e.target.value)} className="field field-sm">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.customName || p.model}（{p.price}）
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="单价 $">
                  <input type="number" min="0.01" step="0.01" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="面议" className="field field-sm font-sign" />
                </FormField>
                <FormField label="数量">
                  <input type="number" min="0.001" step="any" value={addQty} onChange={e => setAddQty(e.target.value)} className="field field-sm font-sign" />
                </FormField>
                <FormField label="单位">
                  <select value={addUnit} onChange={e => setAddUnit(e.target.value)} className="field field-sm">
                    {PI_UNITS.map(u => (
                      <option key={u.key} value={u.key}>
                        {u.label.zh}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <button type="button" onClick={addItem} className="btn btn-sm btn-dark w-full">
                <Plus className="w-4 h-4" />
                加入报价单
              </button>

              {items.length > 0 && (
                <ol className="space-y-2.5 border-t border-line pt-4" aria-label="报价单商品">
                  {items.map((item, idx) => (
                    <li key={item.key} className="rounded-lg border border-line bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-night truncate">
                            {idx + 1}. {item.productName}
                          </div>
                          <div className="font-sign text-xs text-slate-500">{item.model}</div>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="icon-btn !w-7 !h-7" aria-label="上移">
                            ↑
                          </button>
                          <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="icon-btn !w-7 !h-7" aria-label="下移">
                            ↓
                          </button>
                          <button type="button" onClick={() => removeItem(item.key)} className="icon-btn danger !w-7 !h-7" aria-label={`移除 ${item.model}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_1fr_5.5rem] gap-2">
                        <label className="block">
                          <span className="sr-only">单价</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.unitPriceUsd || ''}
                            onChange={e => updateItem(item.key, { unitPriceUsd: round2(num(e.target.value)) })}
                            className="field field-sm font-sign"
                            aria-label={`${item.model} 单价`}
                          />
                        </label>
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity || ''}
                          onChange={e => updateItem(item.key, { quantity: Math.round(num(e.target.value) * 1000) / 1000 })}
                          className="field field-sm font-sign"
                          aria-label={`${item.model} 数量`}
                        />
                        <select value={item.unit} onChange={e => updateItem(item.key, { unit: e.target.value })} className="field field-sm" aria-label={`${item.model} 单位`}>
                          {PI_UNITS.map(u => (
                            <option key={u.key} value={u.key}>
                              {u.label.zh}
                            </option>
                          ))}
                        </select>
                      </div>
                      <details className="mt-2 group">
                        <summary className="cursor-pointer text-xs text-sky-800 select-none">
                          修改印在单据上的名称和规格{item.nameOverride !== undefined || item.specOverride !== undefined ? '（已修改）' : ''}
                        </summary>
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={lines[idx]?.name || ''}
                            onChange={e => updateItem(item.key, { nameOverride: e.target.value })}
                            className="field field-sm"
                            aria-label="单据上的名称"
                          />
                          <textarea
                            value={lines[idx]?.spec || ''}
                            onChange={e => updateItem(item.key, { specOverride: e.target.value })}
                            rows={2}
                            className="field field-sm resize-y"
                            aria-label="单据上的规格"
                          />
                          {(item.nameOverride !== undefined || item.specOverride !== undefined) && (
                            <button type="button" onClick={() => updateItem(item.key, { nameOverride: undefined, specOverride: undefined })} className="text-xs text-slate-500 underline">
                              恢复为商品资料
                            </button>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Panel>

          <Panel title="费用与备注">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <FormField label="海运费 $">
                  <input type="number" min={0} step="0.01" value={term.freight ? freight || '' : ''} disabled={!term.freight} onChange={e => setFreight(round2(num(e.target.value)))} placeholder={term.freight ? '0' : '不适用'} className="field field-sm font-sign" />
                </FormField>
                <FormField label="保险费 $">
                  <input type="number" min={0} step="0.01" value={term.insurance ? insurance || '' : ''} disabled={!term.insurance} onChange={e => setInsurance(round2(num(e.target.value)))} placeholder={term.insurance ? '0' : '不适用'} className="field field-sm font-sign" />
                </FormField>
                <FormField label="折扣 $">
                  <input type="number" min={0} step="0.01" value={discount || ''} onChange={e => setDiscount(round2(num(e.target.value)))} placeholder="0" className="field field-sm font-sign" />
                </FormField>
              </div>
              <FormField label="备注" hint={config.standardTerms ? '「报价单设置」里的标准条款会自动附在后面。' : undefined}>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className="field field-sm resize-y" placeholder="例如：Price based on full container load." />
              </FormField>
            </div>
          </Panel>

          {!billingLoading && !billingReady && (
            <p className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-950">
              <span className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
              还没有设置收款账户，报价单上会写「银行信息另行提供」。超级管理员可在「经营概览」页底部填写。
            </p>
          )}
        </div>

        {/* Preview */}
        <div className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-slate-500">
            <span className="flex items-center gap-1.5">
              预览 <span className="font-sign text-night">{quotationNumber}</span>
              <button type="button" onClick={() => setQuotationNumber(generateQuotationNumber())} className="text-sky-700 p-0.5" title="换一个单号" aria-label="换一个单号">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </span>
            <span>
              合计 <span className="font-sign font-semibold text-night">${money(total)}</span>
            </span>
          </div>
          {(blockers.length > 0 || warnings.length > 0) && (
            <ul className="mb-3 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-950">
              {blockers.map(b => (
                <li key={b} className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  开具前请{b}
                </li>
              ))}
              {warnings.map(w => (
                <li key={w} className="flex gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-[#dfe5ea] p-3 sm:p-5">
            <SheetPreview ref={outputRef} doc={doc} />
          </div>
          <p className="mt-2 px-1 text-xs text-slate-500">
            「开具并下载 PDF」直接下载文件；「开具并打印」在打印窗口选「另存为 PDF」得到可复制文字的 PDF。同一个单号只会开具一次。
          </p>
        </div>
      </div>

      {/* Recently issued */}
      <Panel title="最近开具" className="mt-6" bodyClassName="relative overflow-x-auto" actions={<span className="text-[13px] text-slate-500">最近 20 份</span>}>
        {recentQuotations.length === 0 ? (
          <EmptyState icon={<FileText className="w-5 h-5" />} title="还没有开具过报价单" hint="开具后会保存在这里，可以随时重新下载。" />
        ) : (
          <table className="tbl min-w-[760px]">
            <thead>
              <tr>
                <th>单号</th>
                <th>客户</th>
                <th className="text-end">金额（USD）</th>
                <th>关联线索</th>
                <th>开具人</th>
                <th>时间</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {recentQuotations.slice(0, 20).map(q => (
                <tr key={q.id}>
                  <td className="font-sign">{q.quotationNumber}</td>
                  <td>{q.clientCompany || q.clientName}</td>
                  <td className="text-end font-sign font-semibold">{money(q.totalAmountUsd)}</td>
                  <td className="font-sign text-slate-500">{q.leadId || '—'}</td>
                  <td>{q.createdBy || '—'}</td>
                  <td className="font-sign text-[13px] text-slate-500">{q.createdAt ? formatDateTime(q.createdAt) : q.date}</td>
                  <td className="text-end">
                    <button type="button" onClick={() => setViewing(q)} className="btn btn-sm btn-ghost">
                      <Eye className="w-4 h-4" />
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <QuotationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} config={config} canEdit={isSuperAdmin} onSaved={onShowToast} />

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        size="xl"
        title={viewing ? `报价单 ${viewing.quotationNumber}` : ''}
        description={viewing && !viewing.details ? '这是旧版报价单，公司信息按现在的设置显示。' : '按开具时的内容显示，不会重新开具，也不会更新线索。'}
        footer={
          <>
            <button type="button" onClick={historyPrint} className="btn btn-sm btn-outline">
              <Printer className="w-4 h-4" />
              打印
            </button>
            <button type="button" onClick={historyDownload} disabled={busy} className="btn btn-sm btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              下载 PDF
            </button>
          </>
        }
      >
        {viewingDoc && (
          <div className="rounded-lg bg-[#dfe5ea] p-3">
            <SheetPreview ref={historyOutputRef} doc={viewingDoc} maxHeight={560} />
          </div>
        )}
      </Modal>
    </div>
  );
};
