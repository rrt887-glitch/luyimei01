import React, { useEffect, useState } from 'react';
import { ArrowUp, Facebook, Linkedin, MessageCircle, QrCode, X, Youtube } from 'lucide-react';
import { useI18n } from '../../i18n';
import { hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { toAccessibleMediaUrl } from '../../services/networkProxy';

/** Alibaba.com has no icon in the icon set: a simple "a" mark in its orange. */
const AlibabaMark: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path fill="currentColor" d="M12.2 6c-3.6 0-6.2 2.3-6.2 5.6 0 3 2.1 5.4 5.4 5.4 1.5 0 2.7-.5 3.6-1.4l.4 1.1H18V7.2h-2.6l-.4 1.1C14.2 6.9 13.3 6 12.2 6Zm.2 2.8c1.7 0 2.9 1.3 2.9 3 0 1.8-1.2 3-2.9 3s-3-1.2-3-3 1.3-3 3-3Z" />
  </svg>
);
const TikTokMark: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path fill="currentColor" d="M16.6 3h-3v11.2a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .9.1V8.5a5.8 5.8 0 1 0 4.8 5.7V8.6a7 7 0 0 0 3.9 1.2V6.8a3.9 3.9 0 0 1-3.9-3.8Z" />
  </svg>
);

type Item = { key: string; label: string; href?: string; icon: React.ReactNode; tone: string; panel?: React.ReactNode };

/**
 * Bottom-right floating buttons: WhatsApp, the WeChat Official Account QR code (shown on hover or
 * tap), Alibaba.com and social pages set in the console, and "back to top". Each one appears only
 * when it is set.
 */
export const FloatingContact: React.FC = () => {
  const { d } = useI18n();
  const cfg = useSiteContactConfig();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  // Phones: the buttons fold behind one "contact us" button so they do not cover the page.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!openKey && !expanded) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest?.('[data-floating-contact]')) {
        setOpenKey(null);
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openKey, expanded]);

  const items: Item[] = [];
  if (hasConfiguredWhatsApp()) {
    items.push({ key: 'wa', label: 'WhatsApp', href: `https://wa.me/${cfg.whatsappNumber.replace(/[^0-9]/g, '')}`, icon: <MessageCircle className="w-5 h-5" />, tone: 'bg-[#25D366] text-night' });
  }
  if (cfg.wechatQrUrl) {
    items.push({
      key: 'wechat',
      label: d.site.floatWechat,
      icon: <QrCode className="w-5 h-5" />,
      tone: 'bg-[#07C160] text-white',
      panel: (
        <span className="block w-44 text-center">
          <img src={toAccessibleMediaUrl(cfg.wechatQrUrl)} alt={d.site.floatWechat} referrerPolicy="no-referrer" className="w-40 h-40 mx-auto rounded-md bg-white object-contain" />
          <span className="mt-2 block text-sm font-semibold text-night">{d.site.floatWechat}</span>
          <span className="block text-xs text-slate-500">{d.site.floatWechatHint}</span>
        </span>
      )
    });
  }
  const links: [string, string, React.ReactNode, string][] = [
    ['alibaba', cfg.alibabaUrl, <AlibabaMark />, 'bg-[#FF6A00] text-white'],
    ['facebook', cfg.facebookUrl, <Facebook className="w-5 h-5" />, 'bg-[#1877F2] text-white'],
    ['linkedin', cfg.linkedinUrl, <Linkedin className="w-5 h-5" />, 'bg-[#0A66C2] text-white'],
    ['youtube', cfg.youtubeUrl, <Youtube className="w-5 h-5" />, 'bg-[#FF0000] text-white'],
    ['tiktok', cfg.tiktokUrl, <TikTokMark />, 'bg-black text-white']
  ];
  const labels: Record<string, string> = { alibaba: d.site.floatAlibaba, facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok' };
  for (const [key, href, icon, tone] of links) if (href) items.push({ key, label: labels[key], href, icon, tone });

  if (items.length === 0 && !showTop) return null;

  return (
    <div data-floating-contact className="fixed bottom-5 end-4 sm:bottom-6 sm:end-5 z-40 flex flex-col items-end gap-2.5 print:hidden" aria-label={d.site.floatContact} role="group">
      <div className={`${expanded ? 'flex' : 'hidden'} sm:flex flex-col items-end gap-2.5`}>
      {items.map(item => {
        const open = openKey === item.key;
        const button = 'peer relative inline-flex h-11 w-11 items-center justify-center rounded-full shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2';
        return (
          <div key={item.key} className="group relative flex items-center">
            {/* Label (links) or QR panel (WeChat): on hover / keyboard focus, or after a tap. */}
            <span
              className={`pointer-events-none absolute end-full me-3 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-sm text-night shadow-xl ring-1 ring-black/5 transition-opacity duration-150 ${
                open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              } ${item.panel ? 'p-3' : 'font-medium'}`}
              role={item.panel ? 'tooltip' : undefined}
            >
              {item.panel || item.label}
            </span>
            {item.href ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} className={`${button} ${item.tone}`}>
                {item.icon}
              </a>
            ) : (
              <button type="button" aria-label={item.label} aria-expanded={open} onClick={() => setOpenKey(open ? null : item.key)} className={`${button} ${item.tone}`}>
                {item.icon}
              </button>
            )}
          </div>
        );
      })}
      </div>
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-label={d.site.floatContact}
          className="sm:hidden inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky text-night shadow-lg ring-1 ring-black/5"
        >
          {expanded ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        </button>
      )}
      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={d.site.floatTop}
          title={d.site.floatTop}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-night text-white shadow-lg transition-transform hover:scale-105"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
