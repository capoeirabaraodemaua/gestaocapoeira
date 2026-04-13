/**
 * Multi-tenant configuration.
 * Each nucleo maps to a fixed, stable UUID (tenant_id).
 * These are deterministic — never regenerated — so foreign keys remain valid.
 * There is no "tenants" table in the DB; isolation is enforced at the app layer.
 */

export type TenantKey =
  | 'edson-alves'
  | 'ipiranga'
  | 'saracuruna'
  | 'vila-urussai'
  | 'jayme-fichman'
  | 'academia-mais-saude'
  | 'geral';

/** Map from nucleo display name → tenant UUID */
export const NUCLEO_TO_TENANT_ID: Record<string, string> = {
  'Poliesportivo Edson Alves':  'a1000001-0000-4000-8000-000000000001',
  'Poliesportivo do Ipiranga':  'a1000002-0000-4000-8000-000000000002',
  'Saracuruna':                 'a1000003-0000-4000-8000-000000000003',
  'Vila Urussaí':               'a1000004-0000-4000-8000-000000000004',
  'Jayme Fichman':              'a1000005-0000-4000-8000-000000000005',
  'Academia Mais Saúde':        'a1000006-0000-4000-8000-000000000006',
  // Legacy / backward-compat
  'Mauá':                       'a1000001-0000-4000-8000-000000000001',
};

/** Map from admin nucleo key → tenant UUID */
export const NUCLEO_KEY_TO_TENANT_ID: Record<string, string> = {
  'edson-alves':          'a1000001-0000-4000-8000-000000000001',
  'ipiranga':             'a1000002-0000-4000-8000-000000000002',
  'saracuruna':           'a1000003-0000-4000-8000-000000000003',
  'vila-urussai':         'a1000004-0000-4000-8000-000000000004',
  'jayme-fichman':        'a1000005-0000-4000-8000-000000000005',
  'academia-mais-saude':  'a1000006-0000-4000-8000-000000000006',
  'geral':                null as unknown as string, // geral sees all tenants
};

/** Default tenant (Poliesportivo Edson Alves) used when nucleo is unknown */
export const DEFAULT_TENANT_ID = 'a1000001-0000-4000-8000-000000000001';

/**
 * Returns the tenant_id for a given nucleo display name.
 * Falls back to DEFAULT_TENANT_ID if not found.
 */
export function getTenantId(nucleo: string): string {
  return NUCLEO_TO_TENANT_ID[nucleo] ?? DEFAULT_TENANT_ID;
}

/**
 * Returns the tenant_id for a given admin nucleo key (e.g. 'saracuruna').
 * Returns null for 'geral' (sees all tenants).
 */
export function getTenantIdByKey(nucleoKey: string): string | null {
  if (nucleoKey === 'geral') return null;
  return NUCLEO_KEY_TO_TENANT_ID[nucleoKey] ?? DEFAULT_TENANT_ID;
}
