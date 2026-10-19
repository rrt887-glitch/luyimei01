import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SupportedLanguage } from '../types';
import { zh } from './locales/zh';

export type Dictionary = typeof zh;

/**
 * Chinese ships with the page; the other languages are separate small downloads, fetched only
 * for visitors who use them (main.tsx waits for the saved language before the first render).
 */
const loaders: Record<Exclude<SupportedLanguage, 'zh'>, () => Promise<Dictionary>> = {
  en: () => import('./locales/en').then(m => m.en),
  ar: () => import('./locales/ar').then(m => m.ar),
  ru: () => import('./locales/ru').then(m => m.ru)
};
const loaded: Partial<Record<SupportedLanguage, Dictionary>> = { zh };

const LANG_KEY = 'lym_lang';
const isLang = (v: unknown): v is SupportedLanguage => v === 'zh' || v === 'en' || v === 'ar' || v === 'ru';

export function savedLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return isLang(saved) ? saved : 'zh';
  } catch {
    return 'zh';
  }
}

export async function loadDictionary(lang: SupportedLanguage): Promise<Dictionary> {
  if (!loaded[lang]) loaded[lang] = await loaders[lang as Exclude<SupportedLanguage, 'zh'>]();
  return loaded[lang]!;
}

interface I18nContextType {
  lang: SupportedLanguage;
  setLang: (lang: SupportedLanguage) => void;
  d: Dictionary;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Falls back to Chinese if the saved language could not be downloaded before the first render.
  const [lang, setLangState] = useState<SupportedLanguage>(() => {
    const saved = savedLanguage();
    return loaded[saved] ? saved : 'zh';
  });

  const setLang = useCallback((next: SupportedLanguage) => {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    loadDictionary(next)
      .then(() => setLangState(next))
      .catch(err => console.warn('Language download failed:', err));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
  }, [lang]);

  const value: I18nContextType = { lang, setLang, d: loaded[lang] || zh, isRTL: lang === 'ar' };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
