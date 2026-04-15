import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeName(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Server-side duplicate check that bypasses RLS using service role key
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { field, value, excludeId } = body as {
      field: 'cpf' | 'identidade' | 'email' | 'nome';
      value: string;
      excludeId?: string; // exclude a specific student ID (for edits)
    };

    if (!field || !value?.trim()) {
      return NextResponse.json({ duplicate: false });
    }

    const cleanValue = value.trim();

    if (field === 'nome') {
      const parts = cleanValue.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        return NextResponse.json({ duplicate: false, error: 'Informe nome e sobrenome completos.' });
      }

      const { data: candidates, error } = await supabaseAdmin
        .from('students')
        .select('id, nome_completo')
        .ilike('nome_completo', `${parts[0][0]}%`)
        .limit(2000);

      if (error) return NextResponse.json({ duplicate: false });

      const normalInput = normalizeName(cleanValue);
      const dup = (candidates || []).find(s => {
        if (excludeId && s.id === excludeId) return false;
        return normalizeName(s.nome_completo || '') === normalInput;
      });

      if (dup) {
        return NextResponse.json({
          duplicate: true,
          field: 'nome',
          message: `Nome já cadastrado: "${dup.nome_completo}". Se for você, use o CPF para acessar seu cadastro.`,
        });
      }
      return NextResponse.json({ duplicate: false });
    }

    // CPF, identidade, email
    let query = supabaseAdmin
      .from('students')
      .select('id, nome_completo')
      .eq(field, cleanValue)
      .limit(1);

    const { data, error } = await query;

    if (error) {
      // Column might not exist yet
      if (error.message?.includes('column') || error.message?.includes('schema')) {
        return NextResponse.json({ duplicate: false });
      }
      return NextResponse.json({ duplicate: false, dbError: error.message });
    }

    const match = (data || []).find(s => !excludeId || s.id !== excludeId);
    if (match) {
      const labels: Record<string, string> = {
        cpf: 'CPF',
        identidade: 'Numeração Única / RG',
        email: 'E-mail',
      };
      return NextResponse.json({
        duplicate: true,
        field,
        message: `${labels[field] || field} já cadastrado(a): ${match.nome_completo}`,
      });
    }

    return NextResponse.json({ duplicate: false });
  } catch (err) {
    console.error('check-duplicate error:', err);
    return NextResponse.json({ duplicate: false });
  }
}
