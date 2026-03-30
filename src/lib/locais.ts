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
    endereco: '7VR3+VW Magé, RJ',
    nucleo: 'Poliesportivo Edson Alves',
    lat: -22.7077527,
    lng: -43.1451925,
    mapUrl: 'https://maps.google.com/?q=-22.7077527,-43.1451925',
  },
  {
    id: 'poliesportivo-ipiranga',
    nome: 'Poliesportivo do Ipiranga',
    endereco: '7RMC+M8 Parque Baia Branca, Magé - RJ',
    nucleo: 'Poliesportivo do Ipiranga',
    lat: -22.7157655,
    lng: -43.1791247,
    mapUrl: 'https://maps.google.com/?q=-22.7157655,-43.1791247',
  },
  {
    id: 'polo-saracuruna',
    nome: 'CIEP 318',
    endereco: '8PGR+4V Parque Uruguaiana, Duque de Caxias - RJ',
    nucleo: 'Saracuruna',
    lat: -22.6746110,
    lng: -43.2577859,
    mapUrl: 'https://maps.google.com/?q=-22.6746110,-43.2577859',
  },
  {
    id: 'nucleo-vila-urussai',
    nome: 'Núcleo Vila Urussaí',
    endereco: 'Vila Urussaí, Duque de Caxias - RJ',
    nucleo: 'Vila Urussaí',
    lat: -22.6681359,
    lng: -43.2545703,
    mapUrl: 'https://maps.google.com/?q=-22.6681359,-43.2545703',
  },
  {
    id: 'nucleo-jayme-fichman',
    nome: 'Núcleo Jayme Fichman',
    endereco: 'Jayme Fichman, Duque de Caxias - RJ',
    nucleo: 'Jayme Fichman',
    lat: -22.6757683,
    lng: -43.2487348,
    mapUrl: 'https://maps.google.com/?q=-22.6757683,-43.2487348',
  },
  {
    id: 'academia-mais-saude',
    nome: 'Academia Mais Saúde',
    endereco: 'Rua 15 de Novembro, 31B – Praia do Anil',
    nucleo: 'Academia Mais Saúde',
    lat: -22.6757683,
    lng: -43.2487348,
    mapUrl: 'https://maps.google.com/?q=-22.6757683,-43.2487348',
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

/** Captura posição GPS de alta precisão via browser.
 *  Sempre força leitura fresca do sensor (maximumAge: 0).
 *  Funciona online e offline — GPS é recurso do dispositivo.
 */
export function capturarGPS(timeoutMs = 30000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0, // sempre leitura fresca — sem cache
    });
  });
}

/** Inicia watchPosition para atualização contínua de GPS.
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
