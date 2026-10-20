import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, MessageCircle, AlertTriangle, UserRound, Clock } from 'lucide-react';
import { useI18n } from '../../i18n';
import { zh } from '../../i18n/locales/zh';
import { Product, SubmitInquiryResult } from '../../types';
import { api } from '../../services/api';
import { useDialog } from '../../hooks/useDialog';
import { getProductCategories, useProductCategories } from '../../config/categories';
import { localizeProduct } from '../../utils/productText';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { WhatsAppInput, guessCountryFromBrowser, joinPhone, splitPhone } from '../common/CountryPicker';

interface ProductInquiryModalProps {
  product: Product | null;
  onClose: () => void;
  onNotify: (msg: string) => void;
  /** Opens the buyer account dialog (sign in / register / my requests). */
  onOpenAccount: () => void;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Quote request for one product, without leaving the product.
 *  - Signed-in buyers: name and WhatsApp come from their account, so it is one tap plus an optional
 *    quantity / note. The request is linked to their account and shows up in "My requests".
 *  - Visitors: name + WhatsApp are asked here (two fields), with a shortcut to sign in.
 * Either way it lands in the console's lead pool like any website inquiry, with the product and
 * model in the first line of the message.
 */
export const ProductInquiryModal: React.FC<ProductInquiryModalProps> = ({ product, onClose, onNotify, onOpenAccount }) => {
  const { d, lang } = useI18n();
  const t = d.quote;
  const { categories } = useProductCategories();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const buyer = api.getCurrentUser();

  const [name, setName] = useState('');
  const [waCountry, setWaCountry] = useState('');
  const [waNumber, setWaNumber] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [qty, setQty] = useState('');
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitInquiryResult | null>(null);
  const [failure, setFailure] = useState('');

  useDialog(!!product, onClose);

  useEffect(() => {
    if (!product) return;
    const current = api.getCurrentUser();
    const { iso, number } = splitPhone(current?.phone);
    setName(current?.name || '');
    setWaCountry(iso || guessCountryFromBrowser());
    setWaNumber(number);
    setDestination(current?.country && current.country !== 'International' ? current.country : '');
    setEditingContact(!current || !current.phone);
    setQty('');
    setNote('');
    setErrors({});
    setResult(null);
    setFailure('');
  }, [product?.id]);

  const recentHours = useMemo(() => {
    if (!product || !buyer) return 0;
    const marker = `型号 ${product.model}`;
    const last = api
      .getUserInquiries(buyer.id)
      .filter(i => i.message.includes(marker))
      .map(i => new Date(i.createdAt).getTime())
      .sort((a, b) => b - a)[0];
    return last && Date.now() - last < DAY_MS ? Math.max(1, Math.round((Date.now() - last) / 3600000)) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, buyer?.id, result]);

  if (!product) return null;

  const shown = localizeProduct(product, lang, d, categories);
  // The console reads Chinese: the lead carries the Chinese product name and category.
  const forConsole = localizeProduct(product, 'zh', zh, getProductCategories());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = joinPhone(waCountry, waNumber);
    const nextErrors: typeof errors = {};
    if (name.trim().length < 2) nextErrors.name = d.contact.errName;
    if (!phone) nextErrors.phone = d.contact.errPhone;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setEditingContact(true);
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const message = [
        `询价产品：${forConsole.name}（型号 ${product.model}）`,
        qty.trim() ? `需求数量：${qty.trim()}` : '',
        note.trim() ? `说明：${note.trim()}` : '',
        lang !== 'zh' ? `（客户使用 ${lang.toUpperCase()} 版网站，产品显示名：${shown.name}）` : ''
      ]
        .filter(Boolean)
        .join('\n');
      const res = await api.submitInquiry({
        name: name.trim(),
        company: buyer?.company || '',
        phone,
        needType: forConsole.category || zh.contact.optMaterial,
        location: destination.trim(),
        message
      });
      setResult(res);
      if (res.syncedToCloud) onNotify(t.successTitle);
    } catch (err) {
      // Not sent and not kept for later: say so in the visitor's language and point to direct contact.
      setFailure((err as Error)?.name === 'InquiryNotSavedError' ? d.contact.direct.unexpected : (err as Error).message || d.account.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  const phoneShown = joinPhone(waCountry, waNumber);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="quote-dialog-title" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-night/60 sm:backdrop-blur-sm animate-in" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <button onClick={onClose} aria-label={d.dialog.close} className="icon-btn absolute top-4 end-4 z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Product being asked about */}
        <div className="flex items-center gap-3.5 border-b border-line px-6 py-4 pe-14">
          <div className="w-14 h-14 shrink-0 overflow-hidden rounded-lg bg-concrete">
            {product.images?.[0] && <img src={product.images[0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{t.title}</p>
            <h2 id="quote-dialog-title" className="text-base font-bold text-night leading-snug line-clamp-2">
              {shown.name}
            </h2>
            <p className="font-sign text-xs text-slate-500 truncate">
              <span dir="ltr">{product.model}　{product.price}</span>
              {shown.unit ? ` ${shown.unit}` : ''}
            </p>
          </div>
        </div>

        {result ? (
          <div className="px-6 py-7 text-center">
            {result.syncedToCloud ? (
              <>
                <CheckCircle2 className="mx-auto w-11 h-11 text-emerald-600" />
                <h3 className="mt-3 text-lg font-bold text-night">{t.successTitle}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  {t.successBody.replace('{id}', result.id).replace('{phone}', result.phone)}
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="mx-auto w-11 h-11 text-amber-500" />
                <p className="mt-3 text-sm text-amber-900 leading-relaxed">{t.queued}</p>
              </>
            )}
            <div className="mt-6 grid gap-2.5">
              {waConfigured && (
                <a
                  href={getWhatsAppInquiryUrl(shown.name, product.model, lang)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-[#25D366] text-night hover:bg-[#20bd5a]"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t.chatNow}
                </a>
              )}
              {buyer ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAccount();
                  }}
                  className="btn btn-outline"
                >
                  {t.viewMine}
                </button>
              ) : (
                <p className="text-[13px] text-slate-500">
                  {t.registerHint}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount();
                    }}
                    className="font-semibold text-sky-deep hover:underline"
                  >
                    {t.register}
                  </button>
                </p>
              )}
              <button type="button" onClick={onClose} className="btn btn-ghost">
                {t.done}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600">{t.subtitle}</p>

            {recentHours > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-sky-wash px-3.5 py-2.5 text-[13px] text-night">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-sky-deep" />
                {t.recent.replace('{h}', String(recentHours))}
              </p>
            )}

            {buyer && !editingContact ? (
              <div className="flex items-center gap-3 rounded-xl bg-concrete px-4 py-3">
                <UserRound className="w-5 h-5 shrink-0 text-sky-deep" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">{t.asBuyer}</p>
                  <p className="text-sm font-semibold text-night truncate">
                    {name}
                    <span className="ms-2 font-sign font-normal text-slate-600" dir="ltr">
                      {phoneShown}
                    </span>
                  </p>
                </div>
                <button type="button" onClick={() => setEditingContact(true)} className="text-sm font-semibold text-sky-deep hover:underline shrink-0">
                  {t.change}
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <div>
                    <label htmlFor="quote-name" className="field-label">
                      {t.name} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="quote-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={e => {
                        setName(e.target.value);
                        if (errors.name) setErrors(p => ({ ...p, name: undefined }));
                      }}
                      maxLength={100}
                      aria-invalid={!!errors.name}
                      className={`field ${errors.name ? 'field-error' : ''}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="quote-wa" className="field-label">
                      WhatsApp <span className="text-red-600">*</span>
                    </label>
                    <WhatsAppInput
                      id="quote-wa"
                      country={waCountry}
                      onCountry={iso => {
                        setWaCountry(iso);
                        if (errors.phone) setErrors(p => ({ ...p, phone: undefined }));
                      }}
                      number={waNumber}
                      onNumber={v => {
                        setWaNumber(v);
                        if (errors.phone) setErrors(p => ({ ...p, phone: undefined }));
                      }}
                      lang={lang}
                      labels={{ country: d.account.countryPlaceholder, search: d.account.countrySearch, none: d.account.countryNone, placeholder: d.contact.phonePlaceholder }}
                      invalid={!!errors.phone}
                    />
                  </div>
                </div>
                {(errors.name || errors.phone) && (
                  <p role="alert" className="text-[13px] text-red-600">
                    {[errors.name, errors.phone].filter(Boolean).join(' ')}
                  </p>
                )}
                {!buyer && (
                  <p className="text-[13px] text-slate-500">
                    {t.loginHint}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAccount();
                      }}
                      className="font-semibold text-sky-deep hover:underline"
                    >
                      {t.login}
                    </button>
                  </p>
                )}
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="quote-qty" className="field-label">
                  {t.qty}
                </label>
                <input id="quote-qty" type="text" value={qty} onChange={e => setQty(e.target.value)} maxLength={80} placeholder={t.qtyPlaceholder} className="field" />
              </div>
              <div>
                <label htmlFor="quote-dest" className="field-label">
                  {t.destination}
                </label>
                <input
                  id="quote-dest"
                  type="text"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  maxLength={100}
                  placeholder={t.destinationPlaceholder}
                  className="field"
                />
              </div>
            </div>
            <div>
              <label htmlFor="quote-note" className="field-label">
                {t.note}
              </label>
              <textarea
                id="quote-note"
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={800}
                placeholder={t.notePlaceholder}
                className="field resize-y"
              />
            </div>

            {failure && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
                {failure}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              {busy ? t.submitting : t.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
