import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Associação Cultural de Capoeira Barão de Mauá - Inscrição",
  description: "Sistema de inscrição da Associação Cultural de Capoeira Barão de Mauá",
  manifest: "/manifest.json",
  themeColor: "#e94560",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Capoeira Mauá",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Associação Cultural de Capoeira Barão de Mauá - Inscrição",
  description: "Sistema de inscrição da Associação Cultural de Capoeira Barão de Mauá",
  manifest: "/manifest.json",
  themeColor: "#e94560",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Capoeira Mauá",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
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
