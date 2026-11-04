import React, { useEffect } from 'react';
import { ArrowLeft, CalendarDays, ChevronRight, Newspaper } from 'lucide-react';
import { useI18n } from '../../i18n';
import { NewsPost } from '../../types';
import { SmartImage } from '../common/SmartImage';
import { contentText, formatNewsDate, mediaUrl, usePublishedNews } from '../../services/siteContent';

/** 公司新闻 page (#/news): published posts, newest first; #/news/<id> shows one article. */
export const NewsPage: React.FC<{ articleId?: string }> = ({ articleId }) => {
  const { d, lang } = useI18n();
  const posts = usePublishedNews();
  const article = articleId ? posts.find(p => p.id === articleId) : undefined;

  useEffect(() => {
    const title = article ? contentText(article, 'title', lang) : d.site.newsTitle;
    const prev = document.title;
    document.title = `${title} · ${d.nav.brandName}`;
    return () => {
      document.title = prev;
    };
  }, [article, lang, d]);

  if (articleId) return <NewsArticle post={article} />;

  return (
    <section id="news" className="bg-white pt-12 pb-20 md:pt-16 md:pb-24 min-h-[70vh]">
      <div className="page-wrap">
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:items-end mb-8">
          <h1 className="section-title">{d.site.newsTitle}</h1>
          <p className="text-[15px] text-slate-600 leading-relaxed">{d.site.newsSubtitle}</p>
        </div>

        {posts.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-[15px] text-slate-600">{d.site.newsEmpty}</p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map(post => {
            const title = contentText(post, 'title', lang);
            const summary = contentText(post, 'summary', lang) || contentText(post, 'content', lang);
            const href = `#/news/${encodeURIComponent(post.id)}`;
            return (
              <article key={post.id} className="group flex flex-col rounded-xl border border-line bg-white overflow-hidden transition-colors hover:border-slate-400">
                <a href={href} className="relative block aspect-[16/10] bg-concrete overflow-hidden" aria-label={title}>
                  {post.coverUrl ? (
                    <SmartImage src={mediaUrl(post.coverThumbUrl || post.coverUrl)} alt={title} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center text-slate-300">
                      <Newspaper className="w-10 h-10" />
                    </span>
                  )}
                </a>
                <div className="flex flex-1 flex-col p-5">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {formatNewsDate(post.date, lang)}
                  </span>
                  <h2 className="mt-1.5 text-lg font-bold text-night leading-snug line-clamp-2">
                    <a href={href} className="hover:text-sky-deep">{title}</a>
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed line-clamp-3">{summary}</p>
                  <div className="flex-1 min-h-3" aria-hidden="true" />
                  <a href={href} className="mt-3 inline-flex items-center gap-1 self-start text-[15px] font-semibold text-sky-deep hover:underline">
                    {d.site.readMore}
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const NewsArticle: React.FC<{ post?: NewsPost }> = ({ post }) => {
  const { d, lang } = useI18n();
  const back = (
    <a href="#/news" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-sky-deep hover:underline">
      <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
      {d.site.backToNews}
    </a>
  );
  if (!post) {
    return (
      <section className="bg-white pt-12 pb-24 min-h-[70vh]">
        <div className="page-wrap max-w-3xl">
          {back}
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-[15px] text-slate-600">{d.site.newsMissing}</p>
        </div>
      </section>
    );
  }
  const title = contentText(post, 'title', lang);
  const paragraphs = contentText(post, 'content', lang)
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(Boolean);
  return (
    <article className="bg-white pt-10 pb-20 md:pt-14 md:pb-24 min-h-[70vh]">
      <div className="page-wrap max-w-3xl">
        {back}
        <span className="mt-6 flex items-center gap-1.5 text-[13px] text-slate-500">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatNewsDate(post.date, lang)}
        </span>
        <h1 className="mt-2 text-2xl sm:text-4xl font-bold leading-tight text-night">{title}</h1>
        {post.coverUrl && <img src={mediaUrl(post.coverUrl)} alt="" referrerPolicy="no-referrer" className="mt-6 w-full aspect-[16/9] rounded-xl object-cover" />}
        <div className="mt-6 space-y-4 text-[15px] sm:text-base leading-[1.9] text-slate-700">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">{p}</p>
          ))}
        </div>
        {(post.images || []).length > 0 && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {post.images!.map(src => (
              <img key={src} src={mediaUrl(src)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
        <div className="mt-10 pt-6 border-t border-line">{back}</div>
      </div>
    </article>
  );
};
