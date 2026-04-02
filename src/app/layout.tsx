import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import LanguageButton from "@/components/LanguageButton";

export const viewport: Viewport = {
  themeColor: "#e94560",
};

export const metadata: Metadata = {
  title: "Sistema de Gestão de Alunos ACCBM",
  description: "Sistema de Gestão de Alunos da Associação Cultural de Capoeira Barão de Mauá",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ACCBM",
  },
  openGraph: {
    title: "Sistema de Gestão de Alunos ACCBM",
    description: "Associação Cultural de Capoeira Barão de Mauá",
    siteName: "Sistema de Gestão de Alunos ACCBM",
    locale: "pt_BR",
    type: "website",
    images: [{ url: '/icon-512.png' }],
  },
  twitter: {
    card: "summary",
    title: "Sistema de Gestão de Alunos ACCBM",
    description: "Associação Cultural de Capoeira Barão de Mauá",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          {children}
          <LanguageButton />
        </LanguageProvider>
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
