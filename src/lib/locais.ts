export interface Local {
  id: string;
  nome: string;
  endereco: string;
  nucleo: string;
  lat: number;
  lng: number;
  mapUrl: string;
}

export const LOCAIS: Local[] = [
  {
    id: 'poliesportivo-edson-alves',
    nome: 'Poliesportivo Edson Alves',
    endereco: 'Praia do Anil — Mauá, Nova Iguaçu - RJ',
    nucleo: 'Mauá',
    lat: -22.7576,
    lng: -43.3744,
    mapUrl: 'https://maps.google.com/?q=Poliesportivo+Edson+Alves,+Praia+do+Anil,+Nova+Iguacu+RJ',
  },
  {
    id: 'poliesportivo-ipiranga',
    nome: 'Poliesportivo do Ipiranga',
    endereco: 'Av. Nossa Sra. da Guia, 202-260 — Parque Baia Branca, Magé - RJ',
    nucleo: 'Mauá',
    lat: -22.6573,
    lng: -43.0372,
    mapUrl: 'https://maps.google.com/?q=Av.+Nossa+Sra.+da+Guia+202,+Parque+Baia+Branca,+Mage+RJ',
  },
  {
    id: 'ciep-318-saracuruna',
    nome: 'CIEP 318',
    endereco: 'Saracuruna — Duque de Caxias - RJ',
    nucleo: 'Saracuruna',
    lat: -22.6518,
    lng: -43.2631,
    mapUrl: 'https://maps.google.com/?q=CIEP+318+Saracuruna+Duque+de+Caxias+RJ',
  },
];

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/** Distância em km entre dois pontos (Haversine) */
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
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
  distKm: number;
}

/**
 * Dado lat/lng do usuário, retorna o local mais próximo e a distância.
 * Retorna null se nenhum local estiver dentro de maxKm.
 */
export function detectarLocal(lat: number, lng: number, maxKm = 5): LocalDetectado | null {
  let melhor: LocalDetectado | null = null;
  for (const local of LOCAIS) {
    const d = distKm(lat, lng, local.lat, local.lng);
    if (!melhor || d < melhor.distKm) {
      melhor = { local, distKm: d };
    }
  }
  if (melhor && melhor.distKm <= maxKm) return melhor;
  return null;
}

/** Captura posição GPS via browser. Promise rejeita se não autorizado. */
export function capturarGPS(timeoutMs = 8000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 60000,
    });
  });
}
