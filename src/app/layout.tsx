import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Associação Cultural de Capoeira Barão de Mauá - Inscrição",
  description: "Sistema de inscrição da Associação Cultural de Capoeira Barão de Mauá",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
