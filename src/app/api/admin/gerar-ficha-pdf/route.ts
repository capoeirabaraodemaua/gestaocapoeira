import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'photos';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Build a complete registration form PDF as HTML then convert to a clean printable blob
function buildFichaHTML(data: Record<string, string>, condicoesAtipicas: string[]): string {
  const field = (label: string, value: string, width = '100%') =>
    `<div style="width:${width};box-sizing:border-box;padding:0 4px 10px 0;display:inline-block;vertical-align:top;">
      <div style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">${label}</div>
      <div style="border-bottom:1.5px solid #333;min-height:22px;font-size:11px;padding:2px 4px;color:#000;">${value || ''}</div>
    </div>`;

  const sectionTitle = (title: string) =>
    `<div style="background:#1a3a2a;color:#fff;padding:5px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:12px 0 8px 0;border-radius:3px;">${title}</div>`;

  const allCondicoes = [
    'TEA (Transtorno do Espectro Autista)', 'TDAH (Transtorno de Déficit de Atenção)', 'Deficiência Intelectual',
    'Síndrome de Down', 'Dislexia', 'Discalculia', 'Transtorno de Ansiedade', 'Dificuldades de Aprendizagem',
    'Atraso no Desenvolvimento', 'Deficiência Visual', 'Deficiência Auditiva', 'Deficiência Física / Motora',
    'TOD (Transtorno Opositivo Desafiador)', 'Superdotação / Altas Habilidades', 'Epilepsia',
    'Retardo Mental (CID: F70–F79)', 'Outro',
  ];

  const sexoOpts = ['masculino', 'feminino', 'nao-binario', 'outros', 'nao-informado'];
  const sexoLabels: Record<string, string> = {
    'masculino': 'Masculino', 'feminino': 'Feminino', 'nao-binario': 'Não-binário',
    'outros': 'Outros', 'nao-informado': 'Prefiro não informar',
  };

  const dataFormatada = data.data_nascimento
    ? data.data_nascimento.split('-').reverse().join('/')
    : '';

  const inscricaoNum = data.ordem_inscricao
    ? `ACCBM-${String(data.ordem_inscricao).padStart(6, '0')}`
    : (data.inscricao_numero ? `ACCBM-${String(data.inscricao_numero).padStart(6, '0')}` : '');

  const now = new Date();
  const dataGeracao = now.toLocaleDateString('pt-BR');
  const horaGeracao = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000}
    @page{size:A4;margin:15mm 12mm}
    .page{padding:0;max-width:186mm}
    .header{display:flex;align-items:center;border-bottom:2.5px solid #1a3a2a;padding-bottom:10px;margin-bottom:8px;}
    .header-logo{width:60px;height:60px;border:2px solid #1a3a2a;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;margin-right:12px;flex-shrink:0;overflow:hidden;}
    .header-title{flex:1}
    .header-title h1{margin:0;font-size:15px;color:#1a3a2a;font-weight:900;text-transform:uppercase}
    .header-title p{margin:2px 0 0;font-size:9px;color:#555}
    .row{display:flex;flex-wrap:wrap;margin:0 -4px}
    .checkbox-row{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0 8px}
    .cb{display:flex;align-items:center;gap:5px;font-size:9.5px}
    .cb-box{width:12px;height:12px;border:1.5px solid #333;display:inline-block;flex-shrink:0;text-align:center;line-height:10px;font-size:9px;}
    .grad-list{display:flex;flex-wrap:wrap;gap:5px;padding:4px 0 8px}
    .grad-item{border:1.5px solid #888;border-radius:4px;padding:2px 7px;font-size:8.5px;white-space:nowrap}
    .sign-area{border:1.5px solid #333;border-radius:4px;height:45px;margin-top:4px}
    .footer{margin-top:14px;border-top:1px solid #aaa;padding-top:6px;font-size:8px;color:#888;text-align:center}
    .badge-id{display:inline-block;background:#1a3a2a;color:#fff;border-radius:4px;padding:2px 10px;font-size:9px;font-weight:800;letter-spacing:0.5px;}
    .meta-info{text-align:right;font-size:9px;color:#777;white-space:nowrap;padding-left:10px;flex-shrink:0;}
  </style></head><body><div class="page">

  <div class="header">
    <div class="header-logo">🥋</div>
    <div class="header-title">
      <h1>Associação Cultural de Capoeira Barão de Mauá</h1>
      <p>FICHA DE INSCRIÇÃO — Sistema Ginga Gestão &nbsp;|&nbsp; Magé e Duque de Caxias — RJ</p>
      ${inscricaoNum ? `<p style="margin-top:4px;"><span class="badge-id">${inscricaoNum}</span></p>` : ''}
    </div>
    <div class="meta-info">
      Data: ${dataGeracao}<br>
      Hora: ${horaGeracao}<br>
      ${inscricaoNum ? `<strong>${inscricaoNum}</strong>` : 'Nº Inscrição: ___________'}
    </div>
  </div>

  ${sectionTitle('1. Núcleo')}
  <div class="checkbox-row">
    ${['Poliesportivo Edson Alves','Poliesportivo do Ipiranga','Saracuruna','Vila Urussaí','Jayme Fichman','Academia Mais Saúde'].map(n =>
      `<div class="cb"><span class="cb-box">${data.nucleo === n ? '✓' : ''}</span> ${n}</div>`
    ).join('')}
  </div>

  ${sectionTitle('2. Identificação Pessoal')}
  <div class="row">
    ${field('Nome Completo *', data.nome_completo || '', '65%')}
    ${field('Apelido (Capoeira)', data.apelido || '', '35%')}
    ${field('Nome Social', data.nome_social || '', '50%')}
    ${field('CPF', data.cpf || '', '25%')}
    ${field('RG / Identidade', data.identidade || '', '25%')}
  </div>
  ${field('Data de Nascimento *', dataFormatada, '25%')}
  <div style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;margin:4px 0 3px;">Sexo:</div>
  <div class="checkbox-row" style="margin-bottom:8px">
    ${sexoOpts.map(s =>
      `<div class="cb"><span class="cb-box">${(data.sexo||'') === s ? '✓' : ''}</span> ${sexoLabels[s]}</div>`
    ).join('')}
  </div>

  ${sectionTitle('3. Contato')}
  <div class="row">
    ${field('Telefone / WhatsApp *', data.telefone || '', '33%')}
    ${field('E-mail *', data.email || '', '67%')}
  </div>

  ${sectionTitle('4. Endereço')}
  <div class="row">
    ${field('CEP', data.cep || '', '18%')}
    ${field('Estado (UF) *', data.estado || '', '12%')}
    ${field('Cidade *', data.cidade || '', '35%')}
    ${field('Bairro *', data.bairro || '', '35%')}
    ${field('Endereço (Rua/Av.) *', data.endereco || '', '60%')}
    ${field('Número *', data.numero || '', '15%')}
    ${field('Complemento', data.complemento || '', '25%')}
  </div>

  ${sectionTitle('5. Filiação')}
  <div class="row">
    ${field('Nome do Pai', data.nome_pai || '', '50%')}
    ${field('Nome da Mãe', data.nome_mae || '', '50%')}
  </div>

  ${sectionTitle('6. Graduação')}
  <div class="row">
    ${field('Tipo de Graduação *', data.tipo_graduacao || '', '40%')}
    ${field('Graduação (Corda) *', data.graduacao || '', '60%')}
  </div>
  <div style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;margin:4px 0 3px;">Graduação Adulta:</div>
  <div class="grad-list">
    ${['Cru','Iniciante','Básico 1','Básico 2','Intermediário 1','Intermediário 2','Avançado 1','Avançado 2','Formado','Monitor','Instrutor','Professor','Contra-Mestre','Mestre'].map(g =>
      `<div class="grad-item" style="background:${data.graduacao===g?'#1a3a2a':'#f5f5f5'};color:${data.graduacao===g?'#fff':'#333'}">${g}</div>`
    ).join('')}
  </div>
  <div style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;margin:4px 0 3px;">Graduação Infantil:</div>
  <div class="grad-list">
    ${['Cru Infantil','Básico 1 Infantil','Básico 2 Infantil','Intermediário 1 Infantil','Intermediário 2 Infantil','Avançado 1 Infantil','Avançado 2 Infantil','Formado Infantil'].map(g =>
      `<div class="grad-item" style="background:${data.graduacao===g?'#1a3a2a':'#f5f5f5'};color:${data.graduacao===g?'#fff':'#333'}">${g}</div>`
    ).join('')}
  </div>

  ${sectionTitle('7. Menor de Idade')}
  <div class="checkbox-row">
    <div class="cb"><span class="cb-box">${data.menor_de_idade==='true'||data.menor_de_idade==='1'?'✓':''}</span> É menor de idade</div>
  </div>
  <div class="row">
    ${field('Nome do Responsável Legal', data.nome_responsavel || '', '55%')}
    ${field('CPF do Responsável', data.cpf_responsavel || '', '45%')}
  </div>

  ${sectionTitle('8. Condições Atípicas / Desenvolvimento')}
  <div style="font-size:9px;color:#555;margin-bottom:5px;">Marque caso o aluno possua alguma condição:</div>
  <div class="checkbox-row">
    ${allCondicoes.map(c =>
      `<div class="cb"><span class="cb-box">${condicoesAtipicas.some(ca => ca.startsWith(c.split('(')[0].trim())) ? '✓' : ''}</span> ${c}</div>`
    ).join('')}
  </div>
  ${condicoesAtipicas.some(c => c.startsWith('Outro'))
    ? `<div style="font-size:9px;color:#333;padding:3px 0;"><strong>Especificação:</strong> ${condicoesAtipicas.find(c => c.startsWith('Outro'))?.replace('Outro: ','') || ''}</div>`
    : field('Especificar (se "Outro"):', '', '100%')
  }

  ${sectionTitle('9. Autorização de Imagem')}
  <div class="checkbox-row">
    <div class="cb"><span class="cb-box">${data.autoriza_imagem==='true'||data.autoriza_imagem==='1'?'✓':''}</span> Autorizo o uso de imagem para fins institucionais</div>
    <div class="cb"><span class="cb-box">${!(data.autoriza_imagem==='true'||data.autoriza_imagem==='1')?'✓':''}</span> Não autorizo</div>
  </div>

  ${sectionTitle('10. Assinaturas')}
  <div class="row" style="margin-top:6px">
    <div style="width:48%;padding-right:8px;box-sizing:border-box">
      <div style="font-size:9px;color:#555;margin-bottom:3px;">Assinatura do Aluno (ou Responsável)</div>
      <div class="sign-area"></div>
      <div style="font-size:9px;color:#555;text-align:center;margin-top:4px;">Ciente e de acordo com o Estatuto da ACCBM</div>
    </div>
    <div style="width:52%;box-sizing:border-box">
      <div style="font-size:9px;color:#555;margin-bottom:3px;">Assinatura do Professor Responsável</div>
      <div class="sign-area"></div>
      <div style="font-size:9px;color:#555;text-align:center;margin-top:4px;">Professor / Mestre / Contra-Mestre</div>
    </div>
  </div>

  <div class="footer">
    Associação Cultural de Capoeira Barão de Mauá — ACCBM &nbsp;|&nbsp; Sistema Ginga Gestão &nbsp;|&nbsp;
    Documento gerado em ${dataGeracao} às ${horaGeracao}${inscricaoNum ? ` &nbsp;|&nbsp; ${inscricaoNum}` : ''}
  </div>

</div></body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Option A: cpf provided → auto-fetch student from DB ────────────────
    let studentData: Record<string, string> = body.student || {};
    let studentId: string = body.student_id || 'novo';
    let condicoesAtipicas: string[] = body.condicoes_atipicas || [];

    if (body.cpf && !body.student) {
      const cpfRaw = String(body.cpf).replace(/\D/g, '');

      // Try formatted CPF first (e.g. 000.000.000-00), then raw digits
      const cpfFormatted = cpfRaw.length === 11
        ? `${cpfRaw.slice(0,3)}.${cpfRaw.slice(3,6)}.${cpfRaw.slice(6,9)}-${cpfRaw.slice(9)}`
        : cpfRaw;

      const tryFetch = async (cpfVal: string) => {
        const { data } = await supabase
          .from('students')
          .select('*')
          .eq('cpf', cpfVal)
          .maybeSingle();
        return data;
      };

      let dbStudent = await tryFetch(cpfFormatted);
      if (!dbStudent) dbStudent = await tryFetch(cpfRaw);

      if (!dbStudent) {
        return NextResponse.json({ error: 'Aluno não encontrado com este CPF.' }, { status: 404 });
      }

      studentId = String(dbStudent.id);

      // Flatten all string fields
      for (const [k, v] of Object.entries(dbStudent)) {
        if (v !== null && v !== undefined) studentData[k] = String(v);
      }

      // Also merge passed-in data (e.g. email override)
      if (body.email) studentData.email = body.email;

      // Fetch student extras (atypical conditions)
      try {
        const extrasKey = 'extras/student-extras.json';
        const { data: signed } = await supabase.storage.from('photos').createSignedUrl(extrasKey, 30);
        if (signed?.signedUrl) {
          const extrasRes = await fetch(signed.signedUrl, { cache: 'no-store' });
          if (extrasRes.ok) {
            const extrasMap = await extrasRes.json();
            const extras = extrasMap[studentId] || {};
            if (extras.email && !studentData.email) studentData.email = extras.email;
            if (extras.apelido && !studentData.apelido) studentData.apelido = extras.apelido;
            if (extras.nome_social && !studentData.nome_social) studentData.nome_social = extras.nome_social;
            if (extras.sexo && !studentData.sexo) studentData.sexo = extras.sexo;
            if (extras.condicoes_atipicas) {
              try { condicoesAtipicas = JSON.parse(extras.condicoes_atipicas); } catch {}
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    // Generate HTML
    const html = buildFichaHTML(studentData, condicoesAtipicas);

    // Save as HTML in student documents folder (with print-to-PDF styles)
    const timestamp = Date.now();
    const nome = (studentData.nome_completo || 'aluno').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const fileName = `documentos/${studentId}/ficha-inscricao-${nome}-${timestamp}.html`;
    const buffer = Buffer.from(html, 'utf-8');

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: 'text/html; charset=utf-8', upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    // Generate signed URL for viewing/downloading (valid 24h)
    const { data: signedData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(fileName, 60 * 60 * 24);

    return NextResponse.json({
      ok: true,
      url: signedData?.signedUrl ?? null,
      fileName,
      html, // Return HTML so client can open print dialog directly
      student_id: studentId,
      nome_completo: studentData.nome_completo || '',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
