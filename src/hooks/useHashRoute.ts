import { useEffect, useState } from 'react';

/**
 * The website is one page plus two stand-alone pages reached from the menu:
 *   #/factory          工厂介绍
 *   #/news             公司新闻
 *   #/news/<id>        one article (a link that can be shared)
 * Any other hash (#products, #contact …) is an anchor on the home page.
 */
export type SitePage = { page: 'home' } | { page: 'factory' } | { page: 'news'; articleId?: string };

export function parseHash(hash: string): SitePage {
  const h = decodeURIComponent(hash || '');
  if (h === '#/factory' || h.startsWith('#/factory/')) return { page: 'factory' };
  if (h === '#/news') return { page: 'news' };
  if (h.startsWith('#/news/')) return { page: 'news', articleId: h.slice('#/news/'.length) || undefined };
  return { page: 'home' };
}

export function useHashRoute(): SitePage {
  const [route, setRoute] = useState<SitePage>(() => parseHash(typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    let last = parseHash(window.location.hash).page;
    const onChange = () => {
      const next = parseHash(window.location.hash);
      const cameFrom = last;
      last = next.page;
      setRoute(prev => {
        const same = prev.page === next.page && (prev as { articleId?: string }).articleId === (next as { articleId?: string }).articleId;
        return same ? prev : next;
      });
      // A home-page anchor opened from another page: the section exists only after the home page
      // renders, so scroll once it is there.
      if (next.page === 'home') {
        const id = window.location.hash.slice(1);
        if (cameFrom === 'home') return; // the browser already jumped to the anchor
        if (!id || id === 'home') window.scrollTo({ top: 0 });
        else {
          let tries = 0;
          const go = () => {
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            else if (tries++ < 20) setTimeout(go, 50);
          };
          setTimeout(go, 0);
        }
      } else {
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
