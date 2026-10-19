import React, { useCallback, useState } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { Product } from '../../types';
import { useI18n } from '../../i18n';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { localizeProduct } from '../../utils/productText';
import { useProductCategories } from '../../config/categories';
import { X, MessageCircle, FileText, AlertTriangle } from 'lucide-react';

interface ProductVideoModalProps {
  product: Product | null;
  onClose: () => void;
  onInquire?: (product: Product) => void;
}

/**
 * A product video in the browser's own player (works the same on phones, supports full screen and
 * picture-in-picture), with a loading state, a clear message if the video cannot be played, and the
 * two next steps: ask on WhatsApp or request a quote.
 */
export const ProductVideoModal: React.FC<ProductVideoModalProps> = ({ product, onClose, onInquire }) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const t = d.video;

  // Listen on the element itself: a fast failure (dead link) can happen before React's handler
  // sees it, and must still show the error instead of an endless spinner.
  const videoRef = useCallback((v: HTMLVideoElement | null) => {
    if (!v) return;
    const fail = () => setState('error');
    const ok = () => setState(s => (s === 'loading' ? 'ready' : s));
    v.addEventListener('error', fail);
    v.addEventListener('loadeddata', ok);
    if (v.error) fail();
    else if (v.readyState >= 2) ok();
  }, []);

  useDialog(!!product, onClose);
  if (!product || !product.videoUrl) return null;
  const text = localizeProduct(product, lang, d, categories);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${t.title}：${text.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 animate-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c1015] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">{text.name}</h3>
            <p className="font-sign text-xs text-sky" dir="ltr">
              {product.model}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={d.dialog.close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-video w-full bg-black">
          {state !== 'error' && (
            <video
              src={product.videoUrl}
              poster={product.videoThumbnail || product.images?.[0]}
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              ref={videoRef}
              className="h-full w-full object-contain"
            />
          )}
          {state === 'loading' && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm text-white/80">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-sky border-t-transparent" aria-hidden="true" />
              {t.loading}
            </div>
          )}
          {state === 'error' && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/85">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="max-w-md">{t.failed}</p>
              <button type="button" onClick={() => setState('loading')} className="btn btn-sm btn-outline border-white/30 text-white hover:bg-white/10">
                {t.retry}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-4 border-t border-white/10 bg-[#11161d] p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-sky" dir="ltr">
              {product.price}
              {text.unit && <span className="font-normal text-slate-400"> {text.unit.startsWith('/') ? text.unit : `/ ${text.unit}`}</span>}
            </p>
            {text.spec && <p className="line-clamp-1 text-xs text-slate-400">{text.spec}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {waConfigured && (
              <a
                href={getWhatsAppInquiryUrl(text.name, product.model, lang)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm bg-[#25D366] text-night hover:bg-[#20bd5a]"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            )}
            {onInquire && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInquire(product);
                }}
                className="btn btn-sm btn-primary"
              >
                <FileText className="h-4 w-4" />
                {d.dialog.requestQuote}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
