import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, Newspaper, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { NewsPost } from '../../types';
import { SmartImage } from '../common/SmartImage';
import { contentText, formatNewsDate, mediaUrl, usePublishedNews } from '../../services/siteContent';

const FIRST_SHOWN = 3;

/** "公司新闻": published posts, newest first; a click opens the full article. Hidden while there are none. */
export const NewsSection: React.FC = () => {
  const { d, lang } = useI18n();
  const posts = usePublishedNews();
  const [showAll, setShowAll] = useState(false);
  const [reading, setReading] = useState<NewsPost | null>(null);

  const shown = showAll ? posts : posts.slice(0, FIRST_SHOWN);

  return (
    <section id="news" className="bg-white py-16 md:py-24">
      <div className="page-wrap">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end mb-8">
          <h2 className="section-title">{d.site.newsTitle}</h2>
          <p className="text-[15px] text-slate-600 leading-relaxed">{d.site.newsSubtitle}</p>
        </div>

        {posts.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-[15px] text-slate-600">{d.site.newsEmpty}</p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(post => {
            const title = contentText(post, 'title', lang);
            const summary = contentText(post, 'summary', lang) || contentText(post, 'content', lang);
            return (
              <article key={post.id} className="group flex flex-col rounded-xl border border-line bg-white overflow-hidden transition-colors hover:border-slate-400">
                <button type="button" onClick={() => setReading(post)} className="relative block aspect-[16/10] bg-concrete overflow-hidden" aria-label={title}>
                  {post.coverUrl ? (
                    <SmartImage src={mediaUrl(post.coverUrl)} alt={title} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center text-slate-300">
                      <Newspaper className="w-10 h-10" />
                    </span>
                  )}
                </button>
                <div className="flex flex-1 flex-col p-5">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {formatNewsDate(post.date, lang)}
                  </span>
                  <h3 className="mt-1.5 text-lg font-bold text-night leading-snug line-clamp-2">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed line-clamp-3">{summary}</p>
                  <div className="flex-1 min-h-3" aria-hidden="true" />
                  <button type="button" onClick={() => setReading(post)} className="mt-3 inline-flex items-center gap-1 self-start text-[15px] font-semibold text-sky-deep hover:underline">
                    {d.site.readMore}
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {posts.length > FIRST_SHOWN && (
          <div className="mt-8 text-center">
            <button type="button" onClick={() => setShowAll(v => !v)} className="btn btn-outline">
              {showAll ? d.site.showLessNews : d.site.showAllNews.replace('{n}', String(posts.length))}
            </button>
          </div>
        )}
      </div>

      {reading && <NewsArticle post={reading} onClose={() => setReading(null)} />}
    </section>
  );
};

const NewsArticle: React.FC<{ post: NewsPost; onClose: () => void }> = ({ post, onClose }) => {
  const { d, lang } = useI18n();
  const title = contentText(post, 'title', lang);
  const paragraphs = contentText(post, 'content', lang)
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.trim())
    .filter(Boolean);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-night/60 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="news-title" onClick={onClose}>
      <article className="relative w-full max-w-3xl max-h-full sm:max-h-[90vh] overflow-y-auto bg-white sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        {post.coverUrl && <img src={mediaUrl(post.coverUrl)} alt="" referrerPolicy="no-referrer" className="w-full aspect-[16/9] object-cover" />}
        <div className="px-6 py-6 sm:px-10 sm:py-8">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatNewsDate(post.date, lang)}
          </span>
          <h2 id="news-title" className="mt-2 text-2xl sm:text-3xl font-bold leading-tight text-night">{title}</h2>
          <div className="mt-5 space-y-4 text-[15px] sm:text-base leading-[1.85] text-slate-700">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">{p}</p>
            ))}
          </div>
          {(post.images || []).length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {post.images!.map(src => (
                <img key={src} src={mediaUrl(src)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>
      </article>
      <button type="button" onClick={onClose} aria-label={d.site.close} className="fixed top-3 end-3 sm:top-5 sm:end-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-night shadow-md hover:bg-concrete">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};
