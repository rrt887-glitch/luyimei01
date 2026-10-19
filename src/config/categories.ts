import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SupportedLanguage } from '../types';
import { sanitizeCategoryConfigForFirestore } from '../utils/firestoreSanitizer';

/**
 * Product categories, managed in the console (商品库 → 管理分类) and stored as ONE document,
 * `site_config/categories` = { items: ProductCategoryDef[], updatedAt }.
 *
 * One document keeps the order and the whole list consistent (no half-applied edits), and the
 * public site reads it with a single listener. Until the document exists, the two original
 * categories below are used, so existing products keep showing under the right heading.
 * Products reference a category by `product.type === category.id`.
 */
export type CategoryNames = { zh: string } & Partial<Record<Exclude<SupportedLanguage, 'zh'>, string>>;

export interface ProductCategoryDef {
  id: string;
  name: CategoryNames;
}

export const CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MAX_CATEGORIES = 40;

export const DEFAULT_CATEGORIES: ProductCategoryDef[] = [
  { id: 'material', name: { zh: '养护材料', en: 'Materials', ar: 'مواد الصيانة', ru: 'Материалы' } },
  { id: 'equipment', name: { zh: '施工设备', en: 'Machinery', ar: 'معدات التنفيذ', ru: 'Оборудование' } }
];

const CACHE_KEY = 'lym_product_categories_v1';

/** Name in the visitor's language, falling back to English, then Chinese. */
export function categoryLabel(cat: ProductCategoryDef | undefined, lang: SupportedLanguage): string {
  if (!cat) return '';
  return (cat.name[lang] || '').trim() || (cat.name.en || '').trim() || cat.name.zh;
}

export function findCategory(list: ProductCategoryDef[], id: string | undefined): ProductCategoryDef | undefined {
  return id ? list.find(c => c.id === id) : undefined;
}

/** Label for a product's category id, even when the category was removed (shows nothing odd). */
export function labelForCategoryId(list: ProductCategoryDef[], id: string | undefined, lang: SupportedLanguage): string {
  const found = findCategory(list, id) || findCategory(DEFAULT_CATEGORIES, id);
  return categoryLabel(found, lang);
}

export function newCategoryId(existing: ProductCategoryDef[]): string {
  const taken = new Set(existing.map(c => c.id));
  for (;;) {
    const id = `c-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

function cleanList(raw: unknown): ProductCategoryDef[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ProductCategoryDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String((item as any)?.id || '');
    const n = (item as any)?.name || {};
    const zh = String(n.zh || '').trim();
    if (!CATEGORY_ID_PATTERN.test(id) || !zh || seen.has(id)) continue;
    seen.add(id);
    const name: CategoryNames = { zh: zh.slice(0, 40) };
    for (const l of ['en', 'ar', 'ru'] as const) {
      const v = String(n[l] || '').trim();
      if (v) name[l] = v.slice(0, 60);
    }
    out.push({ id, name });
  }
  return out;
}

function loadCache(): ProductCategoryDef[] {
  try {
    const parsed = cleanList(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'));
    if (parsed) return parsed;
  } catch {
    // ignore
  }
  return DEFAULT_CATEGORIES;
}

let current: ProductCategoryDef[] = loadCache();
let loaded = false;
const listeners = new Set<(list: ProductCategoryDef[]) => void>();
let subscribed = false;

function publish(list: ProductCategoryDef[]) {
  current = list;
  loaded = true;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  listeners.forEach(cb => cb(list));
}

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  try {
    onSnapshot(
      doc(db, 'site_config', 'categories'),
      snap => {
        const list = snap.exists() ? cleanList(snap.data()?.items) : null;
        publish(list ?? DEFAULT_CATEGORIES);
      },
      err => {
        console.warn('Category sync warning:', err);
        subscribed = false;
      }
    );
  } catch (err) {
    console.warn('Category subscription failed:', err);
    subscribed = false;
  }
}

/** Live category list shared by the website and the console. */
export function useProductCategories(): { categories: ProductCategoryDef[]; loaded: boolean } {
  const [state, setState] = useState(() => ({ categories: current, loaded }));
  useEffect(() => {
    ensureSubscribed();
    const cb = (list: ProductCategoryDef[]) => setState({ categories: list, loaded: true });
    listeners.add(cb);
    if (current !== state.categories) cb(current);
    return () => {
      listeners.delete(cb);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

export function getProductCategories(): ProductCategoryDef[] {
  return current;
}

/** Super-admin only (firestore.rules). Writes the full ordered list. */
export async function saveProductCategories(list: ProductCategoryDef[]): Promise<void> {
  const clean = cleanList(list) || [];
  if (clean.length === 0) throw new Error('至少要保留一个分类');
  if (clean.length > MAX_CATEGORIES) throw new Error(`分类最多 ${MAX_CATEGORIES} 个`);
  await setDoc(
    doc(db, 'site_config', 'categories'),
    sanitizeCategoryConfigForFirestore({ items: clean, updatedAt: new Date().toISOString() })
  );
  publish(clean);
}
