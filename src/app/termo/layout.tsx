import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termo de Autorização — Sistema de Gestão de Alunos ACCBM",
  description: "Assine o Termo de Autorização da Associação Cultural de Capoeira Barão de Mauá",
  openGraph: {
    title: "Sistema de Gestão de Alunos ACCBM",
    description: "Termo de Autorização — Associação Cultural de Capoeira Barão de Mauá",
    siteName: "Sistema de Gestão de Alunos ACCBM",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sistema de Gestão de Alunos ACCBM",
    description: "Termo de Autorização — Associação Cultural de Capoeira Barão de Mauá",
  },
};

export default function TermoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
