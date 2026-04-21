export interface Local {
  id: string;
  nome: string;
  endereco: string;
  nucleo: string;
  lat: number;
  lng: number;
  mapUrl: string;
  ativo?: boolean;
}

// Locais sao carregados dinamicamente da API
// Este array e usado como cache local e fallback
export let LOCAIS: Local[] = [];

// Funcao para carregar locais da API
export async function carregarLocais(): Promise<Local[]> {
  try {
    const res = await fetch('/api/admin/locais', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        LOCAIS = data.filter(l => l.ativo !== false);
        return LOCAIS;
      }
    }
  } catch {}
  return LOCAIS;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/** Distancia em metros entre dois pontos (Haversine) */
export function distMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LocalDetectado {
  local: Local;
  distMetros: number;
}

/**
 * Dado lat/lng do usuario, retorna o local mais proximo.
 * Retorna null se nenhum local estiver dentro de maxMetros.
 * maxMetros = 200 -> precisa estar dentro de 200m do local.
 */
export function detectarLocal(lat: number, lng: number, maxMetros = 200): LocalDetectado | null {
  let melhor: LocalDetectado | null = null;
  for (const local of LOCAIS) {
    const d = distMetros(lat, lng, local.lat, local.lng);
    if (!melhor || d < melhor.distMetros) {
      melhor = { local, distMetros: d };
    }
  }
  if (melhor && melhor.distMetros <= maxMetros) return melhor;
  return null;
}

/** Captura posicao GPS de alta precisao via browser.
 *  Sempre forca leitura fresca do sensor (maximumAge: 0).
 *  Funciona online e offline — GPS e recurso do dispositivo.
 */
export function capturarGPS(timeoutMs = 30000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalizacao nao suportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0, // sempre leitura fresca — sem cache
    });
  });
}

/** Inicia watchPosition para atualizacao continua de GPS.
 *  Retorna o watchId para cancelamento posterior via clearWatch.
 */
export function iniciarWatchGPS(
  onUpdate: (pos: GeolocationPosition) => void,
  onError?: (err: GeolocationPositionError) => void,
): number {
  if (!navigator.geolocation) return -1;
  return navigator.geolocation.watchPosition(onUpdate, onError ?? (() => {}), {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0,
  });
}
