import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// GET /api/admin/nucleos - List all nucleos (tenants)
export async function GET(req: NextRequest) {
  try {
    const adminAuth = req.headers.get('x-admin-auth') || req.nextUrl.searchParams.get('auth') || '';
    if (!['geral', 'admin'].includes(adminAuth.toLowerCase())) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ nucleos: data || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/admin/nucleos - Create a new nucleo (tenant)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { nome, endereco, cidade, estado, telefone, email } = body;

    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return NextResponse.json({ error: 'Nome do núcleo é obrigatório (mínimo 2 caracteres).' }, { status: 400 });
    }

    const slug = slugify(nome.trim());

    // Check if slug already exists
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Já existe um núcleo com esse nome.' }, { status: 400 });
    }

    // Insert new tenant
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        nome: nome.trim(),
        slug,
        endereco: endereco?.trim() || null,
        cidade: cidade?.trim() || null,
        estado: estado?.trim() || null,
        telefone: telefone?.trim() || null,
        email: email?.trim() || null,
        ativo: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, nucleo: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/nucleos - Delete a nucleo (tenant)
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do núcleo é obrigatório.' }, { status: 400 });
    }

    // Check if there are students in this nucleo
    const { count } = await supabaseAdmin
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', id);

    if (count && count > 0) {
      return NextResponse.json({ 
        error: `Não é possível excluir: existem ${count} aluno(s) vinculado(s) a este núcleo.` 
      }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/admin/nucleos - Update a nucleo (tenant)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const adminAuth = (req.headers.get('x-admin-auth') || body.admin_auth || '').toLowerCase();
    if (!['geral', 'admin'].includes(adminAuth)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id, nome, endereco, cidade, estado, telefone, email, ativo } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do núcleo é obrigatório.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (nome !== undefined) {
      updates.nome = nome.trim();
      updates.slug = slugify(nome.trim());
    }
    if (endereco !== undefined) updates.endereco = endereco?.trim() || null;
    if (cidade !== undefined) updates.cidade = cidade?.trim() || null;
    if (estado !== undefined) updates.estado = estado?.trim() || null;
    if (telefone !== undefined) updates.telefone = telefone?.trim() || null;
    if (email !== undefined) updates.email = email?.trim() || null;
    if (ativo !== undefined) updates.ativo = ativo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, nucleo: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
