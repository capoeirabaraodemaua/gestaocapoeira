import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import LanguageButton from "@/components/LanguageButton";

export const metadata: Metadata = {
  title: "Sistema de Gestão de Alunos ACCBM",
  description: "Sistema de Gestão de Alunos da Associação Cultural de Capoeira Barão de Mauá",
  manifest: "/manifest.json",
  themeColor: "#e94560",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sistema de Gestão de Alunos ACCBM",
  },
  openGraph: {
    title: "Sistema de Gestão de Alunos ACCBM",
    description: "Associação Cultural de Capoeira Barão de Mauá",
    siteName: "Sistema de Gestão de Alunos ACCBM",
    locale: "pt_BR",
    type: "website",
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
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
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
