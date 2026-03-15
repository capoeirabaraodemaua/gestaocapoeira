'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, translations, TranslationKey } from './translations';

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'pt',
  setLang: () => {},
  t: (key) => key,
});

const STORAGE_KEY = 'accbm_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('pt');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && stored in translations) setLangState(stored);
    setHydrated(true);
  }, []);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  // Always use 'pt' for SSR/first render to avoid hydration mismatch.
  // After hydration, use the stored language.
  const t = useCallback(
    (key: TranslationKey): string => {
      const activeLang = hydrated ? lang : 'pt';
      return (translations[activeLang] as Record<string, string>)[key]
        ?? (translations.pt as Record<string, string>)[key]
        ?? key;
    },
    [lang, hydrated],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
