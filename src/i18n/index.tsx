import React, { createContext, useContext, useState, useEffect } from 'react';
import { SupportedLanguage } from '../types';
import { zh } from './locales/zh';
import { en } from './locales/en';
import { ar } from './locales/ar';
import { ru } from './locales/ru';

const dictionaries = { zh, en, ar, ru };

interface I18nContextType {
  lang: SupportedLanguage;
  setLang: (lang: SupportedLanguage) => void;
  d: typeof zh;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('lym_lang') as SupportedLanguage;
    return saved && ['zh', 'en', 'ar', 'ru'].includes(saved) ? saved : 'zh';
  });

  const setLang = (newLang: SupportedLanguage) => {
    setLangState(newLang);
    localStorage.setItem('lym_lang', newLang);
  };

  useEffect(() => {
    const isRtl = lang === 'ar';
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
  }, [lang]);

  const value: I18nContextType = {
    lang,
    setLang,
    d: dictionaries[lang] || zh,
    isRTL: lang === 'ar'
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
