import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { SmartImage } from '../common/SmartImage';
import { contentText, mediaUrl, useFactoryPhotos } from '../../services/siteContent';

/**
 * 工厂介绍 page (#/factory): photos of the factory uploaded in the console, each with the place it
 * shows. The first photo is large; a click opens any photo full screen.
 */
export const FactoryPage: React.FC = () => {
  const { d, lang } = useI18n();
  const photos = useFactoryPhotos();
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = `${d.site.factoryTitle} · ${d.nav.brandName}`;
    return () => {
      document.title = prev;
    };
  }, [d]);

  const step = useCallback((delta: number) => setOpen(i => (i === null ? i : (i + delta + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
      if (e.key === 'ArrowLeft') step(rtl ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step]);

  const current = open !== null ? photos[open] : null;

  return (
    <section id="factory" className="bg-concrete pt-12 pb-20 md:pt-16 md:pb-24 min-h-[70vh]">
      <div className="page-wrap">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end mb-8">
          <h1 className="section-title">{d.site.factoryTitle}</h1>
          <p className="text-[15px] text-slate-600 leading-relaxed">{d.site.factorySubtitle}</p>
        </div>

        {photos.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-[15px] text-slate-600">
            {d.site.factoryEmpty}{' '}
            <a href="#contact" className="font-semibold text-sky-deep hover:underline">{d.nav.contact}</a>
          </p>
        )}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {photos.map((p, i) => {
            const title = contentText(p, 'title', lang);
            const desc = contentText(p, 'desc', lang);
            const big = i === 0 && photos.length >= 3;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen(i)}
                className={`group relative overflow-hidden rounded-xl bg-night text-start ${big ? 'col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto' : 'aspect-[4/3]'}`}
                aria-label={title}
              >
                <SmartImage
                  src={mediaUrl(p.imageUrl)}
                  alt={title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/85 via-night/40 to-transparent px-3.5 pt-10 pb-3 sm:px-4">
                  <span className={`block font-semibold text-white ${big ? 'text-lg' : 'text-sm sm:text-[15px]'}`}>{title}</span>
                  {desc && big && <span className="mt-0.5 block text-sm text-white/80 line-clamp-2">{desc}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-night/90 p-4" role="dialog" aria-modal="true" aria-label={contentText(current, 'title', lang)} onClick={() => setOpen(null)}>
          <figure className="relative max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <img src={mediaUrl(current.imageUrl)} alt={contentText(current, 'title', lang)} referrerPolicy="no-referrer" className="mx-auto max-h-[78vh] w-auto rounded-lg object-contain" />
            <figcaption className="mt-3 text-center text-white">
              <span className="font-semibold">{contentText(current, 'title', lang)}</span>
              {contentText(current, 'desc', lang) && <span className="mt-1 block text-sm text-white/75">{contentText(current, 'desc', lang)}</span>}
              <span className="mt-1 block font-sign text-xs text-white/60" dir="ltr">
                {d.site.photoN.replace('{n}', String((open ?? 0) + 1)).replace('{total}', String(photos.length))}
              </span>
            </figcaption>
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label={d.site.prev} className="absolute start-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-night hover:bg-white">
                  <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
                </button>
                <button type="button" onClick={() => step(1)} aria-label={d.site.next} className="absolute end-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-night hover:bg-white">
                  <ChevronRight className="w-5 h-5 rtl:rotate-180" />
                </button>
              </>
            )}
          </figure>
          <button type="button" onClick={() => setOpen(null)} aria-label={d.site.close} className="absolute top-4 end-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </section>
  );
};
