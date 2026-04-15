import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'photos';
const KEY = 'config/audit_logs.json';

export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string; // who did it (admin username or student_id)
  actor_type: 'admin' | 'student' | 'system';
  action: string; // e.g. "update_student", "delete_student", "approve_justificativa"
  target_id?: string; // student id or other resource id
  target_name?: string; // human-readable name
  before?: Record<string, unknown>; // snapshot before change
  after?: Record<string, unknown>; // snapshot after change
  ip?: string;
};

async function loadLogs(): Promise<AuditEntry[]> {
  try {
    const { data: urlData } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(KEY, 30);
    if (!urlData?.signedUrl) return [];
    const res = await fetch(urlData.signedUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function appendLog(entry: AuditEntry): Promise<void> {
  try {
    const logs = await loadLogs();
    logs.unshift(entry); // newest first
    // Keep last 2000 entries
    const trimmed = logs.slice(0, 2000);
    const blob = new Blob([JSON.stringify(trimmed, null, 2)], { type: 'application/json' });
    await supabaseAdmin.storage.from(BUCKET).upload(KEY, blob, { upsert: true });
  } catch { /* non-blocking */ }
}

// GET /api/audit?limit=100&actor=xxx&action=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const actor = searchParams.get('actor');
  const action = searchParams.get('action');
  const target_id = searchParams.get('target_id');

  let logs = await loadLogs();

  if (actor) logs = logs.filter(l => l.actor === actor);
  if (action) logs = logs.filter(l => l.action === action);
  if (target_id) logs = logs.filter(l => l.target_id === target_id);

  return NextResponse.json(logs.slice(0, limit));
}

// POST /api/audit — append a log entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      actor: body.actor || 'unknown',
      actor_type: body.actor_type || 'admin',
      action: body.action || 'unknown',
      target_id: body.target_id,
      target_name: body.target_name,
      before: body.before,
      after: body.after,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    };
    await appendLog(entry);
    return NextResponse.json({ success: true, id: entry.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
