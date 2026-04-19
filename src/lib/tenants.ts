/**
 * Multi-tenant configuration.
 * Now fetches tenants dynamically from the database.
 * For demo/experimental environment, tenants come from the 'tenants' table.
 */

export type TenantKey = string;

/** Default tenant ID - will be overwritten by first tenant from DB */
export const DEFAULT_TENANT_ID = 'experimental';

/**
 * Returns the tenant_id for a given nucleo display name.
 * In the new dynamic system, the tenant_id IS the slug from the database.
 */
export function getTenantId(nucleo: string): string {
  return nucleo || DEFAULT_TENANT_ID;
}

/**
 * Returns the tenant_id for a given admin nucleo key.
 * Returns null for 'geral' (sees all tenants).
 */
export function getTenantIdByKey(nucleoKey: string): string | null {
  if (nucleoKey === 'geral') return null;
  return nucleoKey || DEFAULT_TENANT_ID;
}

/**
 * Fetches all tenants from the database.
 * This is used by the admin panel and login page.
 */
export async function fetchTenants(): Promise<Array<{ id: string; nome: string; slug: string; ativo: boolean }>> {
  try {
    const res = await fetch('/api/admin/nucleos', {
      headers: { 'x-admin-auth': 'geral' },
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.nucleos || [];
  } catch {
    return [];
  }
}
