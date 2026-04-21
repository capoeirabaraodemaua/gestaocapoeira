import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Senha de confirmacao para recuperacao do Owner
const RECOVERY_CONFIRMATION_PASSWORD = 'Mp27032013@';
const OWNER_EMAIL = 'andrecapoeirabarao@gmail.com';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, confirmationPassword, newPassword, email } = body;

    // Acao: solicitar recuperacao (envia email)
    if (action === 'request') {
      // Aqui poderiamos enviar um email real, mas por seguranca vamos apenas retornar instrucoes
      return NextResponse.json({
        ok: true,
        message: `Para recuperar a senha do Owner, entre em contato pelo email: ${OWNER_EMAIL}`,
        contactEmail: OWNER_EMAIL,
      });
    }

    // Acao: confirmar recuperacao com senha de confirmacao
    if (action === 'confirm') {
      // Verifica a senha de confirmacao
      if (confirmationPassword !== RECOVERY_CONFIRMATION_PASSWORD) {
        return NextResponse.json({ error: 'Senha de confirmacao invalida.' }, { status: 401 });
      }

      // Valida a nova senha
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
      }

      // Atualiza a senha do owner no banco
      const { error } = await supabaseAdmin
        .from('admin_credentials')
        .update({ 
          password: newPassword, 
          first_login: true,
          updated_at: new Date().toISOString() 
        })
        .eq('username', 'owner');

      if (error) {
        // Se nao existe no banco, tenta criar
        const { error: insertError } = await supabaseAdmin
          .from('admin_credentials')
          .upsert({
            username: 'owner',
            password: newPassword,
            nucleo: 'geral',
            label: 'Owner (Desenvolvedor)',
            color: '#7c3aed',
            first_login: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'username' });

        if (insertError) {
          return NextResponse.json({ error: 'Erro ao atualizar senha: ' + insertError.message }, { status: 500 });
        }
      }

      return NextResponse.json({
        ok: true,
        message: 'Senha do Owner atualizada com sucesso! Faca login com a nova senha.',
      });
    }

    return NextResponse.json({ error: 'Acao invalida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
