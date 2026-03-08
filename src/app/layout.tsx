import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Gestão de Alunos – ACCBM",
  description: "Sistema de Gestão de Alunos da Associação Cultural de Capoeira Barão de Mauá",
  manifest: "/manifest.json",
  themeColor: "#e94560",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Capoeira Mauá",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {/* System title bar */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
          borderBottom: '2px solid #b91c1c',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <img src="/logo-maua.png" alt="ACCBM" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{
            color: '#f1f5f9',
            fontWeight: 700,
            fontSize: '0.82rem',
            letterSpacing: '0.04em',
            fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase',
          }}>
            Sistema de Gestão de Alunos
          </span>
          <span style={{
            color: '#f87171',
            fontWeight: 900,
            fontSize: '0.82rem',
            letterSpacing: '0.08em',
            fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase',
          }}>
            – ACCBM
          </span>
        </div>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
