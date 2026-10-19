import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { api } from '../../services/api';
import { InquiryFormData, SubmitInquiryResult } from '../../types';
import {
  Send,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Copy,
  PhoneCall,
  Mail,
  RefreshCw,
  Check
} from 'lucide-react';

import { useSiteContactConfig } from '../../config/whatsapp';
import { WhatsAppInput, guessCountryFromBrowser, joinPhone, splitPhone } from '../common/CountryPicker';

interface ContactSectionProps {
  prefilledNeed?: string;
  prefilledMessage?: string;
  onInquirySubmitted: (message: string) => void;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  prefilledNeed,
  prefilledMessage,
  onInquirySubmitted
}) => {
  const { d, lang } = useI18n();
  const contactCfg = useSiteContactConfig();
  const activePhone = contactCfg.hotlinePhone || (contactCfg.whatsappNumber ? `+${contactCfg.whatsappNumber}` : '');
  const activeWeChat = contactCfg.wechatId || 'LYM-Engineering-GZ';
  const activeEmail = contactCfg.officialEmail || 'business@luyimei.com';

  const [formData, setFormData] = useState<InquiryFormData>({
    name: '',
    phone: '',
    needType: d.contact.optMaterial,
    location: '',
    message: ''
  });

  // WhatsApp = country dial code + number; a signed-in buyer's own details are filled in.
  const [waCountry, setWaCountry] = useState('');
  const [waNumber, setWaNumber] = useState('');
  useEffect(() => {
    const buyer = api.getCurrentUser();
    if (buyer?.phone) {
      const { iso, number } = splitPhone(buyer.phone);
      if (iso) setWaCountry(iso);
      setWaNumber(number);
    }
    if (buyer?.name) setFormData(prev => (prev.name ? prev : { ...prev, name: buyer.name || '' }));
    setWaCountry(prev => prev || guessCountryFromBrowser());
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetryingOutbox, setIsRetryingOutbox] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [offlineResult, setOfflineResult] = useState<SubmitInquiryResult | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; message?: string }>({});

  useEffect(() => {
    setPendingOutboxCount(api.getOutboxQueue().length);
  }, []);

  useEffect(() => {
    if (prefilledNeed) {
      setFormData(prev => ({ ...prev, needType: prefilledNeed }));
    }
    if (prefilledMessage) {
      setFormData(prev => ({ ...prev, message: prefilledMessage }));
    }
  }, [prefilledNeed, prefilledMessage]);

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      onInquirySubmitted(`已复制${label}：${text}`);
      setTimeout(() => {
        setCopiedField(prev => (prev === label ? null : prev));
      }, 2500);
    } catch {
      onInquirySubmitted(`请手动复制${label}：${text}`);
    }
  };

  const handleManualRetryOutbox = async () => {
    setIsRetryingOutbox(true);
    try {
      const res = await api.flushInquiryOutbox();
      setPendingOutboxCount(res.remainingCount);
      if (res.flushedCount > 0 && res.remainingCount === 0) {
        setOfflineResult(null);
        setIsSuccess(true);
        onInquirySubmitted(`待发队列中的 ${res.flushedCount} 条询盘已全部成功同步至云端！`);
      } else if (res.flushedCount > 0) {
        onInquirySubmitted(`已同步 ${res.flushedCount} 条询盘，仍有 ${res.remainingCount} 条等待网络恢复。`);
      } else {
        onInquirySubmitted('当前国际云端连接仍受阻，建议使用下方广州总部微信/电话/邮件直连通道。');
      }
    } finally {
      setIsRetryingOutbox(false);
    }
  };

  const validateForm = () => {
    const newErrors: { name?: string; phone?: string; message?: string } = {};
    const name = formData.name.trim();
    const message = formData.message.trim();

    if (!name || name.length < 2) {
      newErrors.name = d.contact.errName;
    }
    if (!joinPhone(waCountry, waNumber)) {
      newErrors.phone = d.contact.errPhone;
    }
    if (!message || message.length < 5) {
      newErrors.message = d.contact.errMessage;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setOfflineResult(null);
      const result = await api.submitInquiry({ ...formData, phone: joinPhone(waCountry, waNumber) });
      setPendingOutboxCount(result.pendingOutboxCount);

      if (result.syncedToCloud) {
        setIsSuccess(true);
        setErrors({});
        onInquirySubmitted(d.contact.submitSuccess);

        setFormData({
          name: api.getCurrentUser()?.name || '',
          phone: '',
          needType: d.contact.optMaterial,
          location: '',
          message: ''
        });

        setTimeout(() => setIsSuccess(false), 8000);
      } else {
        // Honest offline/timeout fallback: saved in local outbox + show direct contact channels
        setIsSuccess(false);
        setOfflineResult(result);
        onInquirySubmitted(
          `国际云端连接响应超时（8秒），询盘 [${result.id}] 已真实存入本机待发队列，请结合直连通道联系顾问。`
        );
      }
    } catch (err) {
      console.error('Inquiry submit unexpected error:', err);
      setIsSuccess(false);
      onInquirySubmitted('提交遇到异常，请直接使用页面下方的广州总部电话或微信直联。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildSummaryText = (rec: SubmitInquiryResult) => {
    return `【路易美工程询盘单 ${rec.id}】\n联系人：${rec.name}\n电话/邮箱：${rec.phone}\n采购类别：${rec.needType}\n项目地点：${rec.location || '待确认'}\n需求明细：${rec.message}`;
  };

  const buildMailtoHref = (rec: SubmitInquiryResult) => {
    const subject = encodeURIComponent(`[工程采购询盘 ${rec.id}] ${rec.needType} - ${rec.name}`);
    const body = encodeURIComponent(buildSummaryText(rec));
    return `mailto:${activeEmail}?subject=${subject}&body=${body}`;
  };


  const channels: { key: string; label: string; value: string; href?: string; copyLabel: string }[] = [
    ...(activePhone
      ? [{ key: 'phone', label: '商务热线', value: activePhone, href: `tel:${activePhone.replace(/[^0-9+]/g, '')}`, copyLabel: '总部热线电话' }]
      : []),
    { key: 'wechat', label: '企业微信', value: activeWeChat, copyLabel: '企业微信号' },
    { key: 'email', label: '工程邮箱', value: activeEmail, href: `mailto:${activeEmail}`, copyLabel: '官方工程邮箱' }
  ];

  const fieldClass = (hasError?: boolean) => `field ${hasError ? 'field-error' : ''}`;

  return (
    <section id="contact" className="bg-night text-white py-16 md:py-24">
      <div className="page-wrap grid gap-12 lg:grid-cols-12 lg:gap-16">
        {/* Left: heading and direct channels */}
        <div className="lg:col-span-5">
          <h2 className="font-bold leading-[1.2] tracking-[-0.01em] text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] text-balance">
            {d.contact.titleMain}
            <br />
            {d.contact.titleSub}
          </h2>
          <p className="mt-5 text-[15px] sm:text-base text-white/75 leading-relaxed max-w-[32em]">{d.contact.desc}</p>

          <div className="mt-10">
            <p className="text-sm text-white/60">不方便填表？也可以直接联系广州总部，7×24 小时有人值守。</p>
            <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {channels.map(c => (
                <li key={c.key} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <span className="block text-xs text-white/55">{c.label}</span>
                    {c.href ? (
                      <a href={c.href} className="font-sign text-[17px] text-white hover:text-sky break-all">
                        {c.value}
                      </a>
                    ) : (
                      <span className="font-sign text-[17px] text-white break-all">{c.value}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(c.value, c.copyLabel)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label={`复制${c.label}`}
                  >
                    {copiedField === c.copyLabel ? <Check className="w-4 h-4 text-sky" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedField === c.copyLabel ? '已复制' : '复制'}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-white/55">
              {d.contact.locationText}　{d.contact.expertiseText}
            </p>
          </div>
        </div>

        {/* Right: inquiry form */}
        <div className="lg:col-span-7 rounded-2xl bg-white text-night p-6 sm:p-9">
          {isSuccess && (
            <div className="anim-pop mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-sm text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">{d.contact.submitSuccess}</strong>
                <span className="text-emerald-800 mt-0.5 block">{d.contact.successSub}</span>
              </div>
            </div>
          )}

          {offlineResult && (
            <div className="anim-pop mb-6 p-4 sm:p-5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-sm space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">询价暂未送达，已保存在本机</div>
                  <p className="text-amber-900 leading-relaxed">
                    连接服务器超时（8 秒），常见于中国大陆直连境外网络。询价单{' '}
                    <span className="font-sign font-semibold">{offlineResult.id}</span> 已保存在这台设备上（共{' '}
                    <span className="font-sign font-semibold">{pendingOutboxCount}</span> 条待发送），网络恢复后会自动补发。
                    为免耽误工期，也可以用下面任一方式直接联系我们：
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopyText(buildSummaryText(offlineResult), '询盘摘要内容')}
                  className="btn btn-sm bg-amber-900 text-white hover:bg-amber-950"
                >
                  <Copy className="w-4 h-4" />
                  <span>复制询价内容</span>
                </button>
                <a href={buildMailtoHref(offlineResult)} className="btn btn-sm bg-white border border-amber-300 hover:border-amber-600 text-amber-950">
                  <Mail className="w-4 h-4" />
                  <span>发邮件</span>
                </a>
                {activePhone && (
                  <a
                    href={`tel:${activePhone.replace(/[^0-9+]/g, '')}`}
                    className="btn btn-sm bg-white border border-amber-300 hover:border-amber-600 text-amber-950"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>打电话</span>
                  </a>
                )}
                <button
                  type="button"
                  disabled={isRetryingOutbox}
                  onClick={handleManualRetryOutbox}
                  className="btn btn-sm bg-amber-100 hover:bg-amber-200 text-amber-950"
                >
                  <RefreshCw className={`w-4 h-4 ${isRetryingOutbox ? 'animate-spin' : ''}`} />
                  <span>{isRetryingOutbox ? '正在重新发送…' : '重新发送'}</span>
                </button>
              </div>
            </div>
          )}

          {!offlineResult && pendingOutboxCount > 0 && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-sm text-amber-950">
              <span>这台设备上有 {pendingOutboxCount} 条询价还没送达</span>
              <button
                type="button"
                disabled={isRetryingOutbox}
                onClick={handleManualRetryOutbox}
                className="btn btn-sm bg-amber-200/70 hover:bg-amber-300/70 text-amber-950"
              >
                <RefreshCw className={`w-4 h-4 ${isRetryingOutbox ? 'animate-spin' : ''}`} />
                <span>重新发送</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="contact-name" className="field-label">
                  {d.contact.labelName} <span className="text-red-600">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'contact-name-err' : undefined}
                  value={formData.name}
                  onChange={e => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                  }}
                  placeholder={d.contact.namePlaceholder}
                  className={fieldClass(!!errors.name)}
                />
                {errors.name && (
                  <span id="contact-name-err" className="text-[13px] text-red-600 mt-1.5 block">
                    {errors.name}
                  </span>
                )}
              </div>

              <div>
                <label htmlFor="contact-phone" className="field-label">
                  {d.contact.labelPhone} <span className="text-red-600">*</span>
                </label>
                <WhatsAppInput
                  id="contact-phone"
                  country={waCountry}
                  onCountry={iso => {
                    setWaCountry(iso);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                  }}
                  number={waNumber}
                  onNumber={v => {
                    setWaNumber(v);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                  }}
                  lang={lang}
                  labels={{ country: d.account.countryPlaceholder, search: d.account.countrySearch, none: d.account.countryNone, placeholder: d.contact.phonePlaceholder }}
                  invalid={!!errors.phone}
                  describedBy={errors.phone ? 'contact-phone-err' : undefined}
                />
                {errors.phone && (
                  <span id="contact-phone-err" className="text-[13px] text-red-600 mt-1.5 block">
                    {errors.phone}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="contact-need" className="field-label">
                  {d.contact.labelNeed}
                </label>
                <select
                  id="contact-need"
                  value={formData.needType}
                  onChange={e => setFormData({ ...formData, needType: e.target.value })}
                  className="field"
                >
                  <option value={d.contact.optMaterial}>{d.contact.optMaterial}</option>
                  <option value={d.contact.optEquipment}>{d.contact.optEquipment}</option>
                  <option value={d.contact.optCustom}>{d.contact.optCustom}</option>
                  <option value={d.contact.optSupport}>{d.contact.optSupport}</option>
                </select>
              </div>

              <div>
                <label htmlFor="contact-location" className="field-label">
                  {d.contact.labelLocation}
                </label>
                <input
                  id="contact-location"
                  type="text"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder={d.contact.locationPlaceholder}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-message" className="field-label">
                {d.contact.labelMessage} <span className="text-red-600">*</span>
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'contact-message-err' : 'contact-hint'}
                value={formData.message}
                onChange={e => {
                  setFormData({ ...formData, message: e.target.value });
                  if (errors.message) setErrors(prev => ({ ...prev, message: undefined }));
                }}
                placeholder={d.contact.messagePlaceholder}
                className={`${fieldClass(!!errors.message)} resize-y`}
              />
              {errors.message ? (
                <span id="contact-message-err" className="text-[13px] text-red-600 mt-1.5 block">
                  {errors.message}
                </span>
              ) : (
                <span id="contact-hint" className="text-[13px] text-slate-500 mt-1.5 block">
                  {d.contact.hint}
                </span>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full sm:w-auto">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{d.contact.submitting}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 rtl:rotate-180" />
                  <span>{d.contact.submitBtn}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};
