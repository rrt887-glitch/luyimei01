/**
 * Website content edited in the console: factory photos (factory_photos) and company news (news).
 *
 * The website listens once per collection and shares the result between the header (which hides
 * its links when a section is empty) and the sections themselves. The last list is cached in the
 * browser so a returning visitor sees the sections at once.
 */
import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';
import { FactoryPhoto, NewsPost, SupportedLanguage } from '../types';
import { sanitizeFactoryPhotoForFirestore, sanitizeNewsPostForFirestore } from '../utils/firestoreSanitizer';
import { toAccessibleMediaUrl } from './networkProxy';
import { withTimeout, ADMIN_OPERATION_TIMEOUT_MS } from './admin/adminShared';

// ---------------------------------------------------------------- shared live lists

type Store<T> = { items: T[]; loaded: boolean; listeners: Set<(items: T[]) => void>; started: boolean };

function createStore<T>(cacheKey: string): Store<T> {
  let items: T[] = [];
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) items = JSON.parse(raw);
  } catch {
    // no cache
  }
  return { items: Array.isArray(items) ? items : [], loaded: false, listeners: new Set(), started: false };
}

function publish<T>(store: Store<T>, cacheKey: string, items: T[]) {
  store.items = items;
  store.loaded = true;
  try {
    localStorage.setItem(cacheKey, JSON.stringify(items));
  } catch {
    // quota / private mode
  }
  store.listeners.forEach(cb => cb(items));
}

const FACTORY_CACHE = 'lym_site_factory_v1';
const NEWS_CACHE = 'lym_site_news_v1';
const factoryStore = createStore<FactoryPhoto>(FACTORY_CACHE);
const newsStore = createStore<NewsPost>(NEWS_CACHE);

export const sortFactoryPhotos = (list: FactoryPhoto[]) =>
  [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
export const sortNews = (list: NewsPost[]) =>
  [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

function startFactory() {
  if (factoryStore.started) return;
  factoryStore.started = true;
  onSnapshot(
    collection(db, 'factory_photos'),
    snap => publish(factoryStore, FACTORY_CACHE, sortFactoryPhotos(snap.docs.map(d => ({ ...(d.data() as FactoryPhoto), id: d.id })))),
    err => console.warn('factory_photos listener warning:', err)
  );
}

function startNews() {
  if (newsStore.started) return;
  newsStore.started = true;
  onSnapshot(
    query(collection(db, 'news'), where('published', '==', true)),
    snap => publish(newsStore, NEWS_CACHE, sortNews(snap.docs.map(d => ({ ...(d.data() as NewsPost), id: d.id })))),
    err => console.warn('news listener warning:', err)
  );
}

function useStore<T>(store: Store<T>, start: () => void): T[] {
  const [items, setItems] = useState<T[]>(store.items);
  useEffect(() => {
    start();
    const cb = (next: T[]) => setItems(next);
    store.listeners.add(cb);
    setItems(store.items);
    return () => {
      store.listeners.delete(cb);
    };
  }, [store, start]);
  return items;
}

/** Factory photos for the website, in display order. */
export const useFactoryPhotos = () => useStore(factoryStore, startFactory);
/** Published news for the website, newest first. */
export const usePublishedNews = () => useStore(newsStore, startNews);

// ---------------------------------------------------------------- texts in the visitor's language

/** A text in the visitor's language: that language, else English, else Chinese. */
export function contentText<K extends string>(
  item: { translations?: Partial<Record<'en' | 'ar' | 'ru', Partial<Record<K, string>>>> } & Partial<Record<K, string>>,
  key: K,
  lang: SupportedLanguage
): string {
  if (lang !== 'zh') {
    const own = item.translations?.[lang]?.[key]?.trim();
    if (own) return own;
    const en = item.translations?.en?.[key]?.trim();
    if (en) return en;
  }
  return (item[key] as string | undefined) || '';
}

export const mediaUrl = (url?: string) => toAccessibleMediaUrl(url || '');

/** "2026-11-03" in the visitor's language. */
export function formatNewsDate(date: string, lang: SupportedLanguage): string {
  const [y, m, d] = (date || '').split('-').map(Number);
  if (!y || !m || !d) return date || '';
  const locale = lang === 'zh' ? 'zh-CN' : lang === 'ar' ? 'ar' : lang === 'ru' ? 'ru-RU' : 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
  } catch {
    return date;
  }
}

// ---------------------------------------------------------------- console (super admins)

function requireStaff() {
  if (!auth.currentUser) throw new Error('登录已过期，请重新登录后再保存。');
}

export const newContentId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function saveFactoryPhoto(photo: FactoryPhoto): Promise<void> {
  requireStaff();
  const now = new Date().toISOString();
  const payload = sanitizeFactoryPhotoForFirestore({ ...photo, createdAt: photo.createdAt || now, updatedAt: now });
  await withTimeout(setDoc(doc(db, 'factory_photos', photo.id), payload), ADMIN_OPERATION_TIMEOUT_MS);
}

export async function deleteFactoryPhoto(id: string): Promise<void> {
  requireStaff();
  await withTimeout(deleteDoc(doc(db, 'factory_photos', id)), ADMIN_OPERATION_TIMEOUT_MS);
}

/** Writes the new display order (index in `ids`) of every photo in one batch. */
export async function reorderFactoryPhotos(photos: FactoryPhoto[]): Promise<void> {
  requireStaff();
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  photos.forEach((p, i) => batch.set(doc(db, 'factory_photos', p.id), sanitizeFactoryPhotoForFirestore({ ...p, order: i, updatedAt: now })));
  await withTimeout(batch.commit(), ADMIN_OPERATION_TIMEOUT_MS);
}

/** All posts, drafts included (super admins only). */
export function subscribeAllNews(onUpdate: (posts: NewsPost[]) => void, onError?: (err: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'news'),
    snap => onUpdate(sortNews(snap.docs.map(d => ({ ...(d.data() as NewsPost), id: d.id })))),
    err => onError?.(err)
  );
}

export async function saveNewsPost(post: NewsPost): Promise<void> {
  requireStaff();
  const now = new Date().toISOString();
  const payload = sanitizeNewsPostForFirestore({ ...post, createdAt: post.createdAt || now, updatedAt: now });
  await withTimeout(setDoc(doc(db, 'news', post.id), payload), ADMIN_OPERATION_TIMEOUT_MS);
}

export async function deleteNewsPost(id: string): Promise<void> {
  requireStaff();
  await withTimeout(deleteDoc(doc(db, 'news', id)), ADMIN_OPERATION_TIMEOUT_MS);
}
