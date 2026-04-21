import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termo de Autorizacao - Sistema de Gestao de Alunos DEMO",
  description: "Assine o Termo de Autorizacao do Sistema de Gestao DEMO",
  openGraph: {
    title: "Sistema de Gestao de Alunos DEMO",
    description: "Termo de Autorizacao - Sistema de Gestao DEMO",
    siteName: "Sistema de Gestao de Alunos DEMO",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sistema de Gestao de Alunos DEMO",
    description: "Termo de Autorizacao - Sistema de Gestao DEMO",
  },
};

export default function TermoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
