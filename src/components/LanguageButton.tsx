'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language, LANGUAGE_FLAGS, LANGUAGE_NAMES } from '@/lib/i18n/translations';

const LANGUAGES: Language[] = ['pt', 'pt-PT', 'en', 'es', 'fr', 'it', 'sv', 'af', 'nl', 'ja', 'ko', 'zh', 'de'];

export default function LanguageButton() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Use 'pt' flag/label until mounted to match SSR output and avoid hydration mismatch
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
            background: '#1a1a2e',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: '190px',
            maxHeight: '400px',
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
                background: lang === l ? 'rgba(180,83,9,0.25)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                color: lang === l ? '#fbbf24' : 'rgba(255,255,255,0.85)',
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
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{LANGUAGE_FLAGS[l]}</span>
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
          background: 'linear-gradient(135deg,#1e293b,#0f172a)',
          border: '1.5px solid rgba(180,83,9,0.5)',
          borderRadius: '10px',
          padding: '7px 13px',
          color: '#fbbf24',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          letterSpacing: '0.03em',
          backdropFilter: 'blur(4px)',
          transition: 'border-color 0.2s',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{LANGUAGE_FLAGS[displayLang]}</span>
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
