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
    endereco: 'Praia do Anil — Mauá, Magé - RJ',
    nucleo: 'Mauá',
    lat: -22.6591,
    lng: -43.1782,
    mapUrl: 'https://maps.google.com/?q=Poliesportivo+Edson+Alves,+Praia+do+Anil,+Maua,+Mage+RJ',
  },
  {
    id: 'poliesportivo-ipiranga',
    nome: 'Poliesportivo do Ipiranga',
    endereco: 'Av. Nossa Sra. da Guia, 202 — Parque Baia Branca, Magé - RJ',
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

/** Distância em metros entre dois pontos (Haversine) */
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
 * Dado lat/lng do usuário, retorna o local mais próximo.
 * Retorna null se nenhum local estiver dentro de maxMetros.
 * maxMetros = 200 → precisa estar dentro de 200m do local.
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

/** Captura posição GPS de alta precisão via browser. */
export function capturarGPS(timeoutMs = 12000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0, // sempre posição fresca
    });
  });
}
