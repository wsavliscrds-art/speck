// Camada de integração com o Apple MapKit JS.
// Carrega a lib, autentica via /api/token, e expõe buscas por região/varredura.

const MAPKIT_CDN = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';

let loadPromise = null;

// Busca o token: em produção usa a função serverless; em dev local você pode
// definir VITE_MAPKIT_TOKEN para testar sem `vercel dev`.
async function fetchToken() {
  const devToken = import.meta.env.VITE_MAPKIT_TOKEN;
  if (devToken) return devToken;
  const r = await fetch('/api/token');
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível obter o token do Apple Maps.');
  }
  const { token } = await r.json();
  return token;
}

// Carrega e inicializa o MapKit uma única vez.
export function loadMapKit() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const start = () => {
      window.mapkit.init({
        authorizationCallback: (done) => {
          fetchToken().then(done).catch((e) => reject(e));
        },
        language: 'pt-BR',
      });
      resolve(window.mapkit);
    };

    if (window.mapkit && window.mapkit.init) {
      // já carregado
      if (window.mapkit.maps) resolve(window.mapkit);
      else start();
      return;
    }

    const script = document.createElement('script');
    script.src = MAPKIT_CDN;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.dataset.libraries = 'map,services,full-map,geojson';
    script.addEventListener('load', start);
    script.addEventListener('error', () => reject(new Error('Falha ao carregar o MapKit JS.')));
    document.head.appendChild(script);
  });

  return loadPromise;
}

// Categorias de comércio (chave = enum do MapKit, label = português).
export const CATEGORIES = [
  { key: 'Restaurant', label: 'Restaurantes' },
  { key: 'Cafe', label: 'Cafés' },
  { key: 'Bakery', label: 'Padarias' },
  { key: 'FoodMarket', label: 'Mercados' },
  { key: 'Store', label: 'Lojas' },
  { key: 'Pharmacy', label: 'Farmácias' },
  { key: 'Bank', label: 'Bancos' },
  { key: 'Hotel', label: 'Hotéis' },
  { key: 'FitnessCenter', label: 'Academias' },
  { key: 'Nightlife', label: 'Bares / Noite' },
  { key: 'GasStation', label: 'Postos' },
  { key: 'Hospital', label: 'Saúde' },
];

// Rótulos amigáveis por categoria retornada pela API.
export function categoryLabel(poiCategory) {
  if (!poiCategory) return '';
  const found = CATEGORIES.find((c) => c.key === poiCategory);
  return found ? found.label : poiCategory;
}

// Converte um mapkit.Place em um "lead" normalizado do nosso app.
export function toLead(place) {
  const coord = place.coordinate || {};
  const urls = place.urls || (place.url ? [place.url] : []);
  const website = Array.isArray(urls) ? urls[0] || '' : String(urls || '');
  const lat = coord.latitude;
  const lon = coord.longitude;
  const id =
    place.id ||
    place.muid ||
    `${place.name}|${lat?.toFixed?.(5)}|${lon?.toFixed?.(5)}`;

  return {
    id,
    name: place.name || 'Sem nome',
    category: place.pointOfInterestCategory || '',
    phone: place.telephone || '',
    website,
    hasWebsite: !!website,
    address: place.formattedAddress || '',
    lat,
    lon,
    appleMaps:
      lat != null && lon != null
        ? `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(place.name || '')}`
        : null,
  };
}

// Monta o filtro de POIs a partir das categorias escolhidas (vazio = todas).
function buildFilter(mapkit, categoryKeys) {
  if (!categoryKeys || categoryKeys.length === 0) return undefined;
  const cats = categoryKeys
    .map((k) => mapkit.PointOfInterestCategory[k])
    .filter(Boolean);
  if (cats.length === 0) return undefined;
  return mapkit.PointOfInterestFilter.including(cats);
}

// Busca comércios em UMA região retangular (mapkit.CoordinateRegion).
export function searchRegion(mapkit, region, categoryKeys) {
  return new Promise((resolve, reject) => {
    const options = { region };
    const filter = buildFilter(mapkit, categoryKeys);
    if (filter) options.pointOfInterestFilter = filter;

    const poi = new mapkit.PointsOfInterestSearch(options);
    poi.search((error, data) => {
      if (error) return reject(error);
      const places = (data && data.places) || [];
      resolve(places.map(toLead));
    });
  });
}

// Geocodifica um texto (cidade, bairro) e devolve uma região aproximada.
export function geocode(mapkit, query) {
  return new Promise((resolve, reject) => {
    const geocoder = new mapkit.Geocoder({ language: 'pt-BR', getsUserLocation: false });
    geocoder.lookup(query, (error, data) => {
      if (error) return reject(error);
      const first = data && data.results && data.results[0];
      if (!first) return reject(new Error('Local não encontrado.'));
      const region =
        first.region ||
        new mapkit.CoordinateRegion(
          first.coordinate,
          new mapkit.CoordinateSpan(0.08, 0.08)
        );
      resolve({ region, coordinate: first.coordinate, name: first.formattedAddress });
    });
  });
}

// Divide uma região em uma grade N x N e busca em cada célula, deduplicando.
// Cobre uma área maior (cidade inteira) já que cada busca da Apple é limitada.
export async function sweepRegion(mapkit, region, categoryKeys, opts = {}) {
  const density = Math.max(1, Math.min(opts.density || 3, 6)); // 1..6
  const onProgress = opts.onProgress || (() => {});

  const center = region.center;
  const span = region.span;
  const cellLat = span.latitudeDelta / density;
  const cellLon = span.longitudeDelta / density;
  const startLat = center.latitude - span.latitudeDelta / 2 + cellLat / 2;
  const startLon = center.longitude - span.longitudeDelta / 2 + cellLon / 2;

  const seen = new Map();
  const total = density * density;
  let done = 0;

  for (let i = 0; i < density; i++) {
    for (let j = 0; j < density; j++) {
      const cellCenter = new mapkit.Coordinate(
        startLat + i * cellLat,
        startLon + j * cellLon
      );
      const cellRegion = new mapkit.CoordinateRegion(
        cellCenter,
        new mapkit.CoordinateSpan(cellLat, cellLon)
      );
      try {
        const leads = await searchRegion(mapkit, cellRegion, categoryKeys);
        for (const lead of leads) if (!seen.has(lead.id)) seen.set(lead.id, lead);
      } catch (e) {
        // uma célula falhar não deve derrubar a varredura toda
        console.warn('Falha em uma célula da varredura:', e);
      }
      done++;
      onProgress(done, total, seen.size);
      // respeita o rate limit da Apple
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return Array.from(seen.values());
}
