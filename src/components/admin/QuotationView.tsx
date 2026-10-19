import React, { useState, useRef, useEffect } from 'react';
import { getProductCategories } from '../../config/categories';
import { Product } from '../../types';
import { adminApi } from '../../services/adminApi';
import { QuotationItem, QuotationSheet, AdminLead } from '../../types/admin';
import { useSiteContactConfig, hasConfiguredWhatsApp } from '../../config/whatsapp';
import { normalizeClonedColorsForHtml2Canvas } from '../../utils/html2canvasSafeClone';
import { generateQuotationNumber } from '../../services/admin/quotationService';
// jsPDF / html2canvas (~600 KB) are loaded on demand in handleDownloadPdf, never in the main bundle.
import { Printer, Download, Loader2, Plus, Trash2, CheckCircle2, ExternalLink, RefreshCw, FileText } from 'lucide-react';
import { PageHeader, Panel, FormField, EmptyState } from './AdminUI';
import { formatDateTime } from '../../utils/format';
import { useBillingConfig, isBillingConfigured } from '../../config/billing';

interface QuotationViewProps {
  products: Product[];
  leads?: AdminLead[];
  initialLeadId?: string | null;
  onClearInitialLeadId?: () => void;
  onRefreshData?: () => void;
  onShowToast: (msg: string) => void;
}

type QuotationLang = 'en' | 'bilingual' | 'ar' | 'ru';

export const QuotationView: React.FC<QuotationViewProps> = ({
  products,
  leads: propsLeads,
  initialLeadId,
  onClearInitialLeadId,
  onRefreshData,
  onShowToast
}) => {
  const contactCfg = useSiteContactConfig();
  const { billing, loading: billingLoading } = useBillingConfig();
  const billingReady = isBillingConfigured(billing);
  const waConfigured = hasConfiguredWhatsApp();
  const [quotationLang, setQuotationLang] = useState<QuotationLang>('bilingual');
  const [linkedLeadId, setLinkedLeadId] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientCountry, setClientCountry] = useState('');
  const [portOfLoading, setPortOfLoading] = useState('Guangzhou / Huangpu Port, China (FOB)');
  const [paymentTerms, setPaymentTerms] = useState('30% T/T Advance Deposit, 70% before shipment');
  const [validDays, setValidDays] = useState('30 Days');

  const quotationSheetRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [lastDownloadedPdf, setLastDownloadedPdf] = useState<{
    url: string;
    filename: string;
    sizeKb: number;
    timestamp: string;
  } | null>(null);

  // Controlled quotation number to guarantee that preview, record, and export strictly match
  const [quotationNumber, setQuotationNumber] = useState<string>(() => generateQuotationNumber());
  const [recentQuotations, setRecentQuotations] = useState<QuotationSheet[]>(() => adminApi.getQuotations());

  useEffect(() => adminApi.subscribeToQuotations(setRecentQuotations), []);

  const handleRegenerateQuotationNumber = () => {
    const newNo = generateQuotationNumber();
    setQuotationNumber(newNo);
    onShowToast(`新单号：${newNo}`);
  };

  // Quotation items
  const [items, setItems] = useState<QuotationItem[]>([]);

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '0');
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemUnit, setAddItemUnit] = useState('Ton');
  const [addItemUnitPrice, setAddItemUnitPrice] = useState<number>(420);

  // Auto-detect unit and price when selected product changes
  const handleSelectProductChange = (id: string) => {
    setSelectedProductId(id);
    const prod = products.find(p => p.id === id);
    if (prod) {
      const isTape = prod.model.includes('TAPE') || prod.model.includes('带') || (prod.customName || '').includes('带');
      const isSealant = prod.model.includes('SEAL') || prod.model.includes('胶') || (prod.customName || '').includes('胶');
      const isColdPatch = prod.model.includes('CP') || prod.model.includes('沥青') || (prod.customName || '').includes('沥青');
      const defUnit = prod.unit || (prod.type === 'equipment' ? 'Set' : isTape ? 'Roll' : isSealant || isColdPatch ? 'Ton' : 'Unit');
      setAddItemUnit(defUnit);

      const match = prod.price.match(/\$([0-9,.]+)/);
      if (match) {
        setAddItemUnitPrice(parseFloat(match[1].replace(/,/g, '')));
      } else {
        // Face-to-face / Negotiable (面议): reset to 0 so seller enters actual agreed price
        setAddItemUnitPrice(0);
      }
    }
  };

  const totalAmountUsd = Math.max(0, items.reduce((sum, item) => sum + Math.max(0, item.amountUsd), 0));

  // Quick prefill from CRM Leads
  const leads = propsLeads || adminApi.getLeads();
  const handlePrefillFromLead = (leadId: string) => {
    if (!leadId) {
      // Explicitly unlink: the next export must not write back to the previously selected lead.
      setLinkedLeadId('');
      onShowToast('已取消关联，这张报价单不会更新线索');
      return;
    }
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    setLinkedLeadId(lead.id);
    setClientName(lead.customerName);
    setClientCompany(
      lead.company && lead.company.trim()
        ? lead.company.trim()
        : lead.customerName.includes('(')
        ? lead.customerName
        : `${lead.customerName} Enterprise`
    );
    setClientCountry(lead.location);
    onShowToast(`已关联线索 ${lead.id}，开具后会更新它的估值和阶段`);
  };

  useEffect(() => {
    if (!initialLeadId) return;
    const matched = leads.find(l => l.id === initialLeadId);
    if (matched) {
      setLinkedLeadId(matched.id);
      setClientName(matched.customerName);
      setClientCompany(
        matched.company && matched.company.trim()
          ? matched.company.trim()
          : matched.customerName.includes('(')
          ? matched.customerName
          : `${matched.customerName} Enterprise`
      );
      setClientCountry(matched.location);
      onClearInitialLeadId?.();
    }
  }, [initialLeadId, leads, onClearInitialLeadId]);

  /**
   * Persist the quotation (once per PI number) and write it back to the CRM.
   * Returns null when the quotation could not be issued (validation / network) — the caller stops.
   */
  const issueCurrentQuotation = async (): Promise<{ alreadyIssued: boolean; crmSynced: boolean } | null> => {
    try {
      const res = await adminApi.issueQuotation({
        quotationNumber,
        leadId: linkedLeadId || undefined,
        clientName: clientName.trim(),
        clientCompany: clientCompany.trim(),
        clientCountry: clientCountry.trim(),
        date: new Date().toLocaleDateString(),
        validUntil: validDays,
        portOfLoading,
        paymentTerms,
        currency: 'USD ($)',
        items,
        totalAmountUsd,
        lang: quotationLang,
        notes: 'Prices are based on FOB Guangzhou Huangpu Port terms including standard export wooden pallet packing.'
      });
      if (res.crmSynced) onRefreshData?.();
      return res;
    } catch (err) {
      onShowToast(`报价单保存失败：${(err as Error).message}`);
      return null;
    }
  };

  /** After a quotation has been issued, prepare a fresh PI number for the next one. */
  const startNextQuotation = () => {
    setQuotationNumber(generateQuotationNumber());
  };

  const handleAddItem = () => {
    const p = products.find(prod => prod.id === selectedProductId);
    if (!p) return;

    if (addItemUnitPrice <= 0) {
      onShowToast(`「${p.model}」没有标价，请先填写单价`);
      return;
    }

    const safeQty = Math.max(1, Math.floor(Number(addItemQty) || 1));
    const safeUnitPrice = Math.max(0.01, Number(addItemUnitPrice) || 0.01);
    const safeAmount = Math.round(safeUnitPrice * safeQty * 100) / 100;

    const newItem: QuotationItem = {
      productId: p.id,
      productName: p.customName || `${p.model} (${getProductCategories().find(c => c.id === p.type)?.name.zh || '道路养护产品'})`,
      model: p.model,
      unitPriceUsd: safeUnitPrice,
      quantity: safeQty,
      unit: addItemUnit || (p.type === 'material' ? 'Ton' : 'Set'),
      amountUsd: safeAmount
    };

    setItems([...items, newItem]);
    onShowToast(`已添加 ${p.model}，${safeQty} ${newItem.unit}`);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleDownloadPdf = async () => {
    if (!quotationSheetRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    onShowToast(`正在生成 ${quotationNumber} 的 PDF…`);

    const piNumber = quotationNumber;
    const issued = await issueCurrentQuotation();
    if (!issued) {
      setIsGeneratingPdf(false);
      return;
    }

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const element = quotationSheetRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        onclone: (clonedDoc) => {
          normalizeClonedColorsForHtml2Canvas(clonedDoc, 'quotation-sheet-paper');
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      // ASCII only: some browsers save a non-ASCII download name as "download" with no extension.
      const cleanCompany = (clientCompany || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Client';
      const filename = `Proforma_Invoice_${cleanCompany}_${piNumber}.pdf`;

      // Generate standard binary Blob
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const sizeKb = Math.max(1, Math.round(pdfBlob.size / 1024));

      // Trigger automatic file download via native anchor
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();

      // Clean up link after delay
      setTimeout(() => {
        if (document.body.contains(downloadLink)) {
          document.body.removeChild(downloadLink);
        }
      }, 5000);

      // Also trigger jsPDF internal save as dual assurance
      try {
        pdf.save(filename);
      } catch {
        // Ignored if handled by blob link
      }

      adminApi.addAuditLog(
        '下载报价单 PDF',
        filename,
        `报价单 ${piNumber}｜客户 ${clientCompany || '-'}｜金额 $${totalAmountUsd.toLocaleString()}`
      );

      // Record download state for user quick-access bar
      setLastDownloadedPdf({
        url: blobUrl,
        filename,
        sizeKb,
        timestamp: new Date().toLocaleTimeString()
      });

      onShowToast(
        issued.alreadyIssued
          ? `已重新下载 ${filename}（这个单号之前开过，不会重复更新线索）`
          : issued.crmSynced
          ? `已开具 ${filename}，线索 ${linkedLeadId} 已更新为「已报价」，估值 $${totalAmountUsd.toLocaleString()}`
          : `已开具 ${filename}`
      );
      startNextQuotation();
    } catch (err) {
      console.error('Failed to export PDF directly:', err);
      onShowToast('浏览器拦截了下载，已改用打印：请在打印窗口选择「另存为 PDF」');
      // The quotation is already issued above; the print fallback must not issue it again.
      printQuotationSheet(piNumber);
      startNextQuotation();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!quotationSheetRef.current || isGeneratingPdf) return;
    const piNumber = quotationNumber;
    const issued = await issueCurrentQuotation();
    if (!issued) return;
    printQuotationSheet(piNumber);
    startNextQuotation();
  };

  const printQuotationSheet = (piNumber: string) => {
    onShowToast('打印窗口打开后，目标打印机选「另存为 PDF」即可保存');
    adminApi.addAuditLog('打印报价单', piNumber, `客户 ${clientCompany || '-'}｜金额 $${totalAmountUsd.toLocaleString()}`);

    const element = quotationSheetRef.current;
    if (!element) {
      window.print();
      return;
    }

    try {
      // Create hidden iframe to print ONLY the quotation sheet paper with pristine styling
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Proforma_Invoice_${(clientCompany || 'Client').replace(/[^a-zA-Z0-9_]/g, '_')}_${piNumber}</title>
              <style>
                * { box-sizing: border-box; }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                  margin: 0;
                  padding: 10mm 15mm;
                  color: #111827;
                  background: #ffffff;
                  font-size: 12px;
                }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th { text-align: left; padding: 8px 4px; border-bottom: 2px solid #111827; font-size: 11px; font-weight: 700; }
                td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
                .block { display: block; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-sign { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
                .font-bold { font-weight: 700; }
                .font-semibold { font-weight: 600; }
                .border-b-2 { border-bottom: 2px solid #111827; }
                .border-b { border-bottom: 1px solid #e5e7eb; }
                .border-t-2 { border-top: 2px solid #111827; }
                .border-t { border-top: 1px solid #e5e7eb; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .items-center { align-items: center; }
                .grid { display: grid; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .gap-6 { gap: 24px; }
                .gap-8 { gap: 32px; }
                .print\\:hidden, .action-cell { display: none !important; }
                @page { size: A4 portrait; margin: 8mm; }
              </style>
            </head>
            <body>
              ${element.innerHTML}
            </body>
          </html>
        `);
        frameDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }, 350);
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  // Multilingual labels for Proforma Invoice
  const textMap = {
    en: {
      title: 'PROFORMA INVOICE',
      dept: 'International Trade Department',
      billTo: 'CUSTOMER / BILL TO:',
      terms: 'TRADE & PAYMENT TERMS:',
      itemCol: 'ITEM / DESCRIPTION',
      modelCol: 'MODEL',
      qtyCol: 'QTY',
      priceCol: 'UNIT PRICE (USD)',
      totalCol: 'TOTAL AMOUNT (USD)',
      subtotal: 'FOB Subtotal:',
      packaging: 'Standard Export Packaging:',
      totalFob: 'TOTAL FOB AMOUNT (USD):',
      remarks: 'REMARKS & BANK COORDINATES:',
      signature: 'AUTHORIZED SIGNATURE & STAMP'
    },
    bilingual: {
      title: 'PROFORMA INVOICE / 形式发票报价单',
      dept: '国际贸易部 · International Trade Department',
      billTo: 'CUSTOMER / 买方企业:',
      terms: 'TRADE & PAYMENT TERMS / 贸易与支付条款:',
      itemCol: 'ITEM / 货物名称描述',
      modelCol: 'MODEL / 型号',
      qtyCol: 'QTY / 数量',
      priceCol: 'UNIT PRICE / 单价 (USD)',
      totalCol: 'TOTAL / 金额 (USD)',
      subtotal: 'FOB 小计:',
      packaging: '出口免熏蒸包装:',
      totalFob: 'FOB 离岸总额 (USD):',
      remarks: 'REMARKS & BANK / 备注与银行信息:',
      signature: '授权签署与印章 / AUTHORIZED STAMP'
    },
    ar: {
      title: 'فاتورة أولية (PROFORMA INVOICE)',
      dept: 'قسم التجارة الدولية · الصادرات',
      billTo: 'العميل / المستورد (BILL TO):',
      terms: 'شروط الشحن والدفع (TERMS):',
      itemCol: 'بيان البضاعة والمواصفات',
      modelCol: 'الموديل',
      qtyCol: 'الكمية',
      priceCol: 'سعر الوحدة (USD)',
      totalCol: 'الإجمالي (USD)',
      subtotal: 'إجمالي FOB:',
      packaging: 'تغليف التصدير القياسي:',
      totalFob: 'إجمالي القيمة FOB (USD):',
      remarks: 'الملاحظات والبيانات البنكية:',
      signature: 'التوقيع والختم المعتمد'
    },
    ru: {
      title: 'ПРОФОРМА-ИНВОЙС (PROFORMA INVOICE)',
      dept: 'Отдел международной торговли',
      billTo: 'ПОКУПАТЕЛЬ / КОМПАНИЯ:',
      terms: 'УСЛОВИЯ ПОСТАВКИ И ОПЛАТЫ:',
      itemCol: 'НАИМЕНОВАНИЕ ТОВАРА',
      modelCol: 'МОДЕЛЬ',
      qtyCol: 'КОЛ-ВО',
      priceCol: 'ЦЕНА ЗА ЕД. (USD)',
      totalCol: 'СУММА (USD)',
      subtotal: 'Подытог FOB:',
      packaging: 'Экспортная упаковка:',
      totalFob: 'ИТОГО FOB (USD):',
      remarks: 'РЕКВИЗИТЫ И ПРИМЕЧАНИЯ:',
      signature: 'ПОДПИСЬ И ПЕЧАТЬ'
    }
  }[quotationLang];

  const langOptions: { key: QuotationLang; label: string }[] = [
    { key: 'bilingual', label: '中英' },
    { key: 'en', label: 'English' },
    { key: 'ar', label: 'العربية' },
    { key: 'ru', label: 'Русский' }
  ];
  const canIssue = items.length > 0 && clientCompany.trim().length > 0;

  return (
    <div className="adm-page">
      <PageHeader
        title="报价单"
        description="填写客户和条款，添加商品，右侧实时预览。开具时自动保存，并更新关联线索的估值和阶段。"
        actions={
          <>
            <button onClick={handlePrint} disabled={isGeneratingPdf || !canIssue} className="btn btn-sm btn-outline">
              <Printer className="w-4 h-4" />
              打印
            </button>
            <button onClick={handleDownloadPdf} disabled={isGeneratingPdf || !canIssue} className="btn btn-sm btn-primary">
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGeneratingPdf ? '正在生成…' : '开具并下载 PDF'}
            </button>
          </>
        }
      />

      {lastDownloadedPdf && (
        <div className="anim-pop mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="truncate">
              <strong className="font-semibold">{lastDownloadedPdf.filename}</strong>
              <span className="text-emerald-800">　{lastDownloadedPdf.sizeKb} KB，{lastDownloadedPdf.timestamp}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <a href={lastDownloadedPdf.url} download={lastDownloadedPdf.filename} className="btn btn-sm bg-emerald-700 text-white hover:bg-emerald-800">
              <Download className="w-4 h-4" />
              再次下载
            </a>
            <a href={lastDownloadedPdf.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">
              <ExternalLink className="w-4 h-4" />
              打开
            </a>
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)] items-start">
        {/* Editor */}
        <div className="space-y-4 xl:sticky xl:top-6">
          <Panel title="客户">
            <div className="space-y-4">
              <FormField label="从线索带入" hint={linkedLeadId ? '开具后，这条线索的估值和阶段会自动更新。' : '可选。关联后会自动填写客户信息。'}>
                <select value={linkedLeadId} onChange={e => handlePrefillFromLead(e.target.value)} className="field field-sm">
                  <option value="">{linkedLeadId ? '不关联线索' : '选择线索…'}</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.customerName}（{l.location || l.id}）
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="客户公司">
                <input type="text" value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="必填" className="field field-sm" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="联系人">
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="field field-sm" />
                </FormField>
                <FormField label="目的国">
                  <input type="text" value={clientCountry} onChange={e => setClientCountry(e.target.value)} className="field field-sm" />
                </FormField>
              </div>
            </div>
          </Panel>

          <Panel title="条款">
            <div className="space-y-4">
              <FormField label="单据语言">
                <div className="segmented w-full" role="group" aria-label="单据语言">
                  {langOptions.map(o => (
                    <button key={o.key} className="flex-1" aria-pressed={quotationLang === o.key} onClick={() => setQuotationLang(o.key)} type="button">
                      {o.label}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="价格条款（起运港）">
                <input type="text" value={portOfLoading} onChange={e => setPortOfLoading(e.target.value)} className="field field-sm" />
              </FormField>
              <FormField label="付款方式">
                <input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="field field-sm" />
              </FormField>
              <FormField label="有效期">
                <input type="text" value={validDays} onChange={e => setValidDays(e.target.value)} className="field field-sm" />
              </FormField>
            </div>
          </Panel>

          <Panel title="添加商品">
            <div className="space-y-4">
              <FormField label="商品">
                <select value={selectedProductId} onChange={e => handleSelectProductChange(e.target.value)} className="field field-sm">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.customName || p.model}（{p.price}）
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="单价 $">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={addItemUnitPrice || ''}
                    onChange={e => setAddItemUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="面议"
                    className="field field-sm font-sign"
                  />
                </FormField>
                <FormField label="数量">
                  <input
                    type="number"
                    min="1"
                    value={addItemQty}
                    onChange={e => setAddItemQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    className="field field-sm font-sign"
                  />
                </FormField>
                <FormField label="单位">
                  <select value={addItemUnit} onChange={e => setAddItemUnit(e.target.value)} className="field field-sm">
                    <option value="Ton">吨</option>
                    <option value="Roll">卷</option>
                    <option value="Meter">米</option>
                    <option value="Drum">桶</option>
                    <option value="Bucket">提</option>
                    <option value="Set">台/套</option>
                    <option value="Unit">件</option>
                    <option value="Box">箱</option>
                  </select>
                </FormField>
              </div>
              <button type="button" onClick={handleAddItem} className="btn btn-sm btn-dark w-full">
                <Plus className="w-4 h-4" />
                加入报价单
                {addItemUnitPrice > 0 && (
                  <span className="font-sign text-white/70">${(Math.round(addItemUnitPrice * addItemQty * 100) / 100).toLocaleString()}</span>
                )}
              </button>
            </div>
          </Panel>

          {!billingLoading && !billingReady && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-950">
              <span className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
              <span>
                还没有设置收款账户，报价单上会写「银行信息另行提供」。超级管理员可在「经营概览」页底部填写。
              </span>
            </div>
          )}
          <p className="text-[13px] text-slate-500 leading-relaxed px-1">
            浏览器拦截下载时会自动改用打印，在打印窗口把目标打印机选为「另存为 PDF」即可。同一个单号只会开具一次。
          </p>
        </div>

        {/* Paper preview */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2 px-1 text-[13px] text-slate-500">
            <span>
              预览　<span className="font-sign text-night">{quotationNumber}</span>
            </span>
            <span>
              合计 <span className="font-sign font-semibold text-night">${totalAmountUsd.toLocaleString()}</span>
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl bg-[#dfe5ea] p-3 sm:p-6">
            <div
              ref={quotationSheetRef}
              id="quotation-sheet-paper"
              className="mx-auto min-w-[720px] max-w-[880px] p-10 sm:p-12 bg-[#ffffff] text-[#111827] shadow-[0_10px_30px_-12px_rgba(15,37,54,0.35)] print:shadow-none print:p-0"
            >
              {/* Header */}
              <div className="flex justify-between items-start gap-6 border-b-2 border-[#111827] pb-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="w-8 h-8 shrink-0 rounded-md bg-[#38bdf8] text-[#0f2536] font-bold text-[11px] flex items-center justify-center">LYM</span>
                    <span className="text-[15px] font-bold leading-snug text-[#111827]">GUANGZHOU LUYIMEI ENGINEERING EQUIPMENT CO., LTD.</span>
                  </div>
                  <p className="text-xs text-[#6b7280] leading-normal">
                    广州路易美工程设备有限公司　{textMap.dept}
                    <br />
                    Huangpu District, Guangzhou, Guangdong, China
                    <br />
                    Email: {contactCfg.officialEmail || 'business@luyimei.com'}
                    {waConfigured ? `　WhatsApp: ${contactCfg.whatsappDisplay}` : ''}
                    {contactCfg.hotlinePhone ? `　Tel: ${contactCfg.hotlinePhone}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <h2 className="text-base font-black leading-snug text-[#111827]">
                    {textMap.title.split(' / ').map(part => (
                      <span key={part} className="block whitespace-nowrap">
                        {part}
                      </span>
                    ))}
                  </h2>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    <span className="font-sign text-xs text-[#4b5563]">PI NO: {quotationNumber}</span>
                    <button type="button" onClick={handleRegenerateQuotationNumber} className="print:hidden text-[#0369a1] p-0.5" title="换一个单号" aria-label="换一个单号">
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-sign text-xs text-[#4b5563] block">DATE: {new Date().toLocaleDateString()}</span>
                </div>
              </div>

              {/* Bill To & Terms */}
              <div className="grid grid-cols-2 gap-8 my-6 text-xs border-b border-[#e5e7eb] pb-6">
                <div>
                  <span className="font-bold text-[#9ca3af] block mb-1">{textMap.billTo}</span>
                  <strong className="text-sm text-[#111827] block">{clientCompany || <span className="text-[#d1d5db] print:hidden">客户公司</span>}</strong>
                  <span className="text-[#4b5563] block">Attn: {clientName}</span>
                  <span className="text-[#4b5563] block">Country: {clientCountry}</span>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-[#9ca3af] block mb-1">{textMap.terms}</span>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6b7280] whitespace-nowrap">Price Term:</span>
                    <strong className="text-[#1f2937] text-right">{portOfLoading}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6b7280] whitespace-nowrap">Payment:</span>
                    <strong className="text-[#1f2937] text-right">{paymentTerms}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#6b7280] whitespace-nowrap">Validity:</span>
                    <strong className="text-[#1f2937] text-right">{validDays}</strong>
                  </div>
                </div>
              </div>

              {/* Line items */}
              <table className="w-full text-left border-collapse text-xs my-6">
                <thead>
                  <tr className="border-b-2 border-[#111827] text-[11px] font-bold text-[#374151]">
                    <th className="py-2.5">{textMap.itemCol}</th>
                    <th className="py-2.5 text-center">{textMap.modelCol}</th>
                    <th className="py-2.5 text-center">{textMap.qtyCol}</th>
                    <th className="py-2.5 text-right">{textMap.priceCol}</th>
                    <th className="py-2.5 text-right">{textMap.totalCol}</th>
                    <th className="py-2.5 w-8 print:hidden action-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e7eb]">
                  {items.length === 0 && (
                    <tr className="print:hidden action-cell">
                      <td colSpan={6} className="py-8 text-center text-[#9ca3af]">
                        还没有商品。在左侧选择商品后点「加入报价单」。
                      </td>
                    </tr>
                  )}
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-semibold text-[#111827]">{item.productName}</td>
                      <td className="py-3 text-center font-sign text-[#374151]">{item.model}</td>
                      <td className="py-3 text-center font-sign text-[#111827]">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3 text-right font-sign text-[#374151]">${item.unitPriceUsd.toLocaleString()}</td>
                      <td className="py-3 text-right font-sign font-bold text-[#111827]">${item.amountUsd.toLocaleString()}</td>
                      <td className="py-3 text-right print:hidden action-cell">
                        <button onClick={() => handleRemoveItem(idx)} className="text-[#9ca3af] hover:text-[#ef4444] p-1" title="移除" aria-label={`移除 ${item.model}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end pt-4 border-t-2 border-[#111827]">
                <div className="w-72 space-y-2 text-xs">
                  <div className="flex justify-between text-[#4b5563]">
                    <span>{textMap.subtotal}</span>
                    <span className="font-sign font-semibold text-[#111827]">${totalAmountUsd.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[#4b5563]">
                    <span>{textMap.packaging}</span>
                    <span className="font-sign text-[#059669] font-medium">INCLUDED</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-[#d1d5db] pt-2 text-[#111827]">
                    <span>{textMap.totalFob}</span>
                    <span className="font-sign text-[#047857] text-base">${totalAmountUsd.toLocaleString()} USD</span>
                  </div>
                </div>
              </div>

              {/* Remarks & signature */}
              <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-[#e5e7eb] text-[11px] text-[#6b7280]">
                <div>
                  <strong className="text-[#1f2937] block mb-1">{textMap.remarks}</strong>
                  <p className="leading-relaxed">
                    Standard sea freight export wooden crate packing.
                    <br />
                    {billingReady ? (
                      <>
                        Beneficiary: {billing.beneficiary}
                        <br />
                        Bank: {billing.bankName}
                        {billing.bankAddress && (
                          <>
                            <br />
                            Bank Address: {billing.bankAddress}
                          </>
                        )}
                        <br />
                        Account No.: <span className="font-sign">{billing.accountNumber}</span>
                        {billing.swiftCode && (
                          <>
                            <br />
                            SWIFT: <span className="font-sign">{billing.swiftCode}</span>
                          </>
                        )}
                        {billing.remarks && (
                          <>
                            <br />
                            {billing.remarks}
                          </>
                        )}
                      </>
                    ) : (
                      <>Bank details will be provided separately upon order confirmation.</>
                    )}
                  </p>
                </div>
                <div className="flex flex-col justify-end text-right">
                  <div className="w-48 border-b border-[#9ca3af] ml-auto mb-1" />
                  <span className="font-medium text-[#374151]">{textMap.signature}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recently issued */}
      <Panel title="最近开具" className="mt-6" bodyClassName="relative overflow-x-auto" actions={<span className="text-[13px] text-slate-500">最近 8 份</span>}>
        {recentQuotations.length === 0 ? (
          <EmptyState icon={<FileText className="w-5 h-5" />} title="还没有开具过报价单" hint="开具后会保存在这里，同一单号不会重复保存。" />
        ) : (
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                <th>单号</th>
                <th>客户</th>
                <th className="text-end">金额（USD）</th>
                <th>关联线索</th>
                <th>开具人</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotations.slice(0, 8).map(q => (
                <tr key={q.id}>
                  <td className="font-sign">{q.quotationNumber}</td>
                  <td>{q.clientCompany || q.clientName}</td>
                  <td className="text-end font-sign font-semibold">${q.totalAmountUsd.toLocaleString()}</td>
                  <td className="font-sign text-slate-500">{q.leadId || '—'}</td>
                  <td>{q.createdBy || '—'}</td>
                  <td className="font-sign text-[13px] text-slate-500">{q.createdAt ? formatDateTime(q.createdAt) : q.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
};
