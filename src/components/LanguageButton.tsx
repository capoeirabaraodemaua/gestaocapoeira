'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language, LANGUAGE_NAMES } from '@/lib/i18n/translations';

const LANGUAGES: Language[] = ['pt', 'pt-PT', 'en', 'es', 'fr', 'it', 'sv', 'af', 'nl', 'ja', 'ko', 'zh', 'de'];

// ISO 3166-1 alpha-2 country codes — SVGs served from /public/flags/
const FLAG_CODES: Record<Language, string> = {
  pt:      'br',
  'pt-PT': 'pt',
  en:      'us',
  es:      'es',
  fr:      'fr',
  it:      'it',
  sv:      'se',
  af:      'za',
  nl:      'nl',
  ja:      'jp',
  ko:      'kr',
  zh:      'cn',
  de:      'de',
};

function FlagImg({ code, size = 24 }: { code: string; size?: number }) {
  return (
    <img
      src={`/flags/${code}.svg`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={code.toUpperCase()}
      style={{
        borderRadius: 3,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
    />
  );
}

export default function LanguageButton() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Use 'pt' flag until mounted to match SSR output and avoid hydration mismatch
  const displayLang = mounted ? lang : 'pt';

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
      {/* Dropdown menu */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '48px',
            right: 0,
            background: '#064E3B',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: '200px',
            maxHeight: '420px',
            overflowY: 'auto',
          }}
        >
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => { setLang(l); setOpen(false); }}
              style={{
                width: '100%',
                padding: '9px 16px',
                background: lang === l ? 'rgba(52,211,153,0.2)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                color: lang === l ? '#6ee7b7' : 'rgba(255,255,255,0.85)',
                fontSize: '13px',
                fontWeight: lang === l ? 700 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <FlagImg code={FLAG_CODES[l]} size={22} />
              <span>{LANGUAGE_NAMES[l]}</span>
              {lang === l && <span style={{ marginLeft: 'auto', fontSize: '10px' }}>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={t('language_button')}
        style={{
          background: '#064E3B',
          border: '1.5px solid rgba(255,255,255,0.25)',
          borderRadius: '10px',
          padding: '7px 13px',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          letterSpacing: '0.03em',
          backdropFilter: 'blur(4px)',
          transition: 'border-color 0.2s',
        }}
      >
        <FlagImg code={FLAG_CODES[displayLang]} size={20} />
        <span>{t('language_button')}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Backdrop to close on outside click */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: -1 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
