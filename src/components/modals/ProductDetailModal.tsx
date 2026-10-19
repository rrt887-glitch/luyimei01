import { SmartImage } from '../common/SmartImage';
import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Product } from '../../types';
import { ProductIllustration } from '../common/SvgIllustrations';
import { X, MessageCircle, ChevronLeft, ChevronRight, Play, Truck, PackageCheck, Factory, MapPin, Package, Tag, Ruler, CircleCheck } from 'lucide-react';
import { getWhatsAppInquiryUrl, hasConfiguredWhatsApp, useSiteContactConfig } from '../../config/whatsapp';
import { useDialog } from '../../hooks/useDialog';
import { useProductCategories } from '../../config/categories';
import { localizeProduct } from '../../utils/productText';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onInquire?: (product: Product) => void;
}

type Media = { kind: 'image'; src: string } | { kind: 'video'; src: string; poster?: string };

/**
 * Product sheet: a large gallery (photos + video) beside the facts a buyer compares —
 * price, volume price, specification and supply terms — with the quote action always in reach.
 * Full screen on phones, a wide two-column sheet on desktop.
 */
export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onInquire }) => {
  const { d, lang } = useI18n();
  const { categories } = useProductCategories();
  useSiteContactConfig();
  const waConfigured = hasConfiguredWhatsApp();
  const [index, setIndex] = useState(0);

  useDialog(!!product, onClose);

  const media = useMemo<Media[]>(() => {
    if (!product) return [];
    const list: Media[] = (product.images || []).filter(Boolean).map(src => ({ kind: 'image' as const, src }));
    if (product.videoUrl) list.push({ kind: 'video', src: product.videoUrl, poster: product.videoThumbnail || product.images?.[0] });
    return list;
  }, [product]);

  useEffect(() => {
    setIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (!product || media.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, video')) return;
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') setIndex(i => (i + (rtl ? -1 : 1) + media.length) % media.length);
      if (e.key === 'ArrowLeft') setIndex(i => (i + (rtl ? 1 : -1) + media.length) % media.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, media.length]);

  if (!product) return null;

  const t = localizeProduct(product, lang, d, categories);
  const current = media[index];
  const tier = product.tierPrices?.find(tp => tp.priceUsd);
  const step = (delta: number) => setIndex(i => (i + delta + media.length) % media.length);

  const facts: { icon: typeof Truck; label: string; value: string; tone?: string; wide?: boolean }[] = [
    { icon: Ruler, label: d.dialog.specTitle, value: t.spec },
    {
      icon: CircleCheck,
      label: d.dialog.statusTitle,
      value: product.inStock ? d.dialog.inStock : d.dialog.madeToOrder,
      tone: product.inStock ? 'text-emerald-700' : 'text-amber-700'
    },
    { icon: Truck, label: d.dialog.leadTime, value: t.leadTime },
    { icon: PackageCheck, label: d.dialog.moq, value: t.moq },
    { icon: Factory, label: d.dialog.capacity, value: t.capacityLabel },
    { icon: MapPin, label: d.dialog.base, value: t.baseLocation },
    { icon: Package, label: d.dialog.packaging, value: t.packaging, wide: true }
  ].filter(row => row.value);

  const quote = () => {
    onClose();
    if (onInquire) onInquire(product);
    else document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-night/70 sm:backdrop-blur-sm animate-in" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full sm:max-w-5xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <button
          onClick={onClose}
          aria-label={d.dialog.close}
          className="absolute top-3 end-3 z-20 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 text-night shadow-sm hover:bg-white sm:backdrop-blur"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
          {/* Gallery */}
          <section className="lg:w-[48%] shrink-0 bg-night flex flex-col justify-center" aria-label={t.name}>
            <div className="relative aspect-[4/3] bg-concrete">
              {!current ? (
                <span className="absolute inset-0 flex items-center justify-center p-10">
                  <ProductIllustration id={product.id} className="max-h-full w-auto" />
                </span>
              ) : current.kind === 'image' ? (
                <SmartImage
                  key={current.src}
                  src={current.src}
                  alt={`${t.name} – ${d.dialog.photoN.replace('{n}', String(index + 1))}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  key={current.src}
                  src={current.src}
                  poster={current.poster}
                  controls
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              )}

              {media.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label={d.dialog.prevPhoto}
                    className="absolute start-3 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/90 text-night shadow hover:bg-white"
                  >
                    <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label={d.dialog.nextPhoto}
                    className="absolute end-3 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-white/90 text-night shadow hover:bg-white"
                  >
                    <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                  </button>
                  <span className="absolute bottom-3 start-3 rounded-full bg-night/75 px-2.5 py-1 font-sign text-xs text-white" aria-live="polite">
                    {index + 1} / {media.length}
                  </span>
                </>
              )}
            </div>

            {media.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-3 py-2.5 shrink-0" role="tablist">
                {media.map((m, i) => (
                  <button
                    key={`${m.kind}-${m.src}`}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    onClick={() => setIndex(i)}
                    aria-label={m.kind === 'video' ? d.dialog.watchVideo : d.dialog.photoN.replace('{n}', String(i + 1))}
                    className={`relative w-16 h-12 shrink-0 overflow-hidden rounded-md transition ${
                      i === index ? 'ring-2 ring-sky ring-offset-2 ring-offset-night' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {m.kind === 'image' ? (
                      <img src={m.src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex w-full h-full items-center justify-center bg-black">
                        {m.poster && <img src={m.poster} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
                        <Play className="relative w-5 h-5 fill-sky text-sky" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Facts */}
          <section className="flex-1 min-w-0 flex flex-col lg:min-h-0">
            <div className="flex-1 min-h-0 px-6 pt-6 pb-5 sm:px-7 lg:overflow-y-auto">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pe-12 text-[13px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-wash px-2.5 py-0.5 font-semibold text-sky-deep">
                  <Tag className="w-3.5 h-3.5" />
                  {t.kind}
                </span>
                <span className="font-sign text-slate-500">{product.model}</span>
              </div>

              <h2 id="product-dialog-title" className="mt-3 text-2xl font-bold leading-tight text-night">
                {t.name}
              </h2>
              {t.desc && <p className="mt-2 text-[15px] leading-relaxed text-slate-600 line-clamp-3">{t.desc}</p>}

              <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 rounded-xl bg-concrete px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-sign text-[1.75rem] leading-none font-semibold text-night">{product.price}</span>
                  {t.unit && <span className="text-sm text-slate-500">{t.unit}</span>}
                </div>
                {tier && (
                  <p className="text-sm text-night">
                    <span className="text-slate-500">{d.dialog.tierPrice}</span>{' '}
                    <span className="font-sign font-semibold">{tier.priceUsd}</span>{' '}
                    <span className="text-slate-500">· {d.dialog.tierFrom.replace('{qty}', String(tier.minQty))}</span>
                  </p>
                )}
                <p className="basis-full text-xs text-slate-500">{d.dialog.priceNote}</p>
              </div>

              {/* Specification, stock and supply terms in one compact grid. */}
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
                {facts.map(row => (
                  <div key={row.label} className={`flex gap-2.5 min-w-0 ${row.wide ? 'col-span-2' : ''}`}>
                    <row.icon className={`w-4 h-4 mt-0.5 shrink-0 ${row.tone || 'text-sky-deep'}`} strokeWidth={1.9} />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">{row.label}</dt>
                      <dd className={`mt-0.5 text-sm leading-snug ${row.tone ? `${row.tone} font-medium` : 'text-night'}`}>{row.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            {/* Action bar, always visible */}
            <div className="sticky bottom-0 lg:static shrink-0 border-t border-line bg-white/95 sm:backdrop-blur px-5 py-3 sm:px-7 grid gap-2.5 sm:grid-flow-col sm:auto-cols-fr">
              {waConfigured ? (
                <>
                  <button type="button" onClick={quote} className="btn btn-outline">
                    {d.dialog.requestQuote}
                  </button>
                  <a
                    href={getWhatsAppInquiryUrl(t.name, product.model, lang)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn bg-[#25D366] text-night hover:bg-[#20bd5a]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {d.dialog.inquireThis}
                  </a>
                </>
              ) : (
                <button type="button" onClick={quote} className="btn btn-primary">
                  <MessageCircle className="w-4 h-4" />
                  {d.dialog.requestQuote}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
