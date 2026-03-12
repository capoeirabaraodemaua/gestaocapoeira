import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUCKET = 'photos';

const LANGUAGES: Record<string, string> = {
  'pt':    'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'en':    'English',
  'es':    'Español',
  'fr':    'Français',
  'it':    'Italiano',
  'sv':    'Svenska',
  'af':    'Afrikaans',
  'nl':    'Nederlands',
  'ja':    '日本語',
  'ko':    '한국어',
  'zh':    '中文 (Chinês)',
  'de':    'Deutsch',
};

/** GET /api/admin/manual/translate?name=xxx — check if translations exist */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const key = `manuais/translations/${name}.json`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(key);
  if (error || !data) return NextResponse.json({ translations: null });

  try {
    const json = JSON.parse(await data.text());
    return NextResponse.json({ translations: json });
  } catch {
    return NextResponse.json({ translations: null });
  }
}

/** POST /api/admin/manual/translate — translate a stored PDF into all languages */
export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  // 1. Download the PDF from storage
  const { data: pdfData, error: dlErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(`manuais/${name}`);
  if (dlErr || !pdfData) {
    return NextResponse.json({ error: 'PDF não encontrado: ' + dlErr?.message }, { status: 404 });
  }

  const pdfBytes = await pdfData.arrayBuffer();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 2. First, extract the full text content from the PDF
  let extractedText = '';
  try {
    const extractRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          } as any,
          {
            type: 'text',
            text: 'Extraia todo o conteúdo textual deste PDF, preservando a estrutura (títulos, seções, listas). Retorne apenas o texto limpo, sem comentários adicionais.',
          },
        ],
      }],
    });
    const textBlock = extractRes.content.find(b => b.type === 'text');
    extractedText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  } catch (e: any) {
    return NextResponse.json({ error: 'Falha ao extrair texto: ' + e.message }, { status: 500 });
  }

  if (!extractedText.trim()) {
    return NextResponse.json({ error: 'PDF não contém texto legível.' }, { status: 400 });
  }

  // 3. Translate to all languages in parallel (batches of 4 to avoid rate limits)
  const langEntries = Object.entries(LANGUAGES);
  const translations: Record<string, string> = {};
  const chunkSize = 4;

  for (let i = 0; i < langEntries.length; i += chunkSize) {
    const chunk = langEntries.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async ([code, langName]) => {
      // PT-BR is the source, just store original
      if (code === 'pt') {
        translations[code] = extractedText;
        return;
      }
      try {
        const res = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: `Traduza o seguinte documento para ${langName}. Preserve toda a formatação estrutural (títulos, seções, listas, numerações). Retorne apenas o texto traduzido, sem comentários adicionais:\n\n${extractedText}`,
          }],
        });
        const block = res.content.find(b => b.type === 'text');
        translations[code] = block && block.type === 'text' ? block.text : extractedText;
      } catch {
        translations[code] = extractedText; // fallback to original
      }
    }));
  }

  // 4. Save translations to storage
  const key = `manuais/translations/${name}.json`;
  const blob = new Blob([JSON.stringify(translations)], { type: 'application/json' });
  const { error: saveErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, blob, { upsert: true });

  if (saveErr) {
    return NextResponse.json({ error: 'Erro ao salvar traduções: ' + saveErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, languages: Object.keys(translations) });
}

/** DELETE /api/admin/manual/translate — remove translations for a manual */
export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  await supabaseAdmin.storage
    .from(BUCKET)
    .remove([`manuais/translations/${name}.json`]);

  return NextResponse.json({ ok: true });
}
