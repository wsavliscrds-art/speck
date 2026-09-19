// Integração com dados abertos do OpenStreetMap — SEM chave de API.
//  - Nominatim: transforma "cidade/bairro" em coordenadas.
//  - Overpass: lista os comércios (shop/amenity/...) num raio.
// Comércio SEM a tag de site = lead quente.

// Espelhos da Overpass (se um estiver ocupado/bloqueado, tenta o próximo).
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// fetch com timeout (evita ficar preso num espelho lento)
async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Categorias -> seletores Overpass. (label em pt, selectors do OSM)
export const CATEGORIES = [
  { key: 'restaurant', label: 'Restaurantes', selectors: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'] },
  { key: 'cafe', label: 'Cafés', selectors: ['["amenity"="cafe"]'] },
  { key: 'bar', label: 'Bares', selectors: ['["amenity"="bar"]', '["amenity"="pub"]'] },
  { key: 'bakery', label: 'Padarias', selectors: ['["shop"="bakery"]'] },
  { key: 'market', label: 'Mercados', selectors: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="grocery"]'] },
  { key: 'shop', label: 'Lojas (geral)', selectors: ['["shop"]'] },
  { key: 'beauty', label: 'Beleza', selectors: ['["shop"="hairdresser"]', '["shop"="beauty"]'] },
  { key: 'pharmacy', label: 'Farmácias', selectors: ['["amenity"="pharmacy"]'] },
  { key: 'fitness', label: 'Academias', selectors: ['["leisure"="fitness_centre"]', '["sport"="fitness"]'] },
  { key: 'auto', label: 'Autopeças/Oficinas', selectors: ['["shop"="car_repair"]', '["shop"="car_parts"]'] },
  { key: 'hotel', label: 'Hotéis/Pousadas', selectors: ['["tourism"="hotel"]', '["tourism"="guest_house"]'] },
  { key: 'services', label: 'Serviços', selectors: ['["craft"]', '["office"]'] },
];

// Geocoder 1: Nominatim (oficial do OSM).
async function geocodeNominatim(query) {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 9000);
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const d = await r.json();
  if (!d || !d[0]) throw new Error('nominatim vazio');
  return { lat: Number(d[0].lat), lon: Number(d[0].lon), label: d[0].display_name };
}

// Geocoder 2: Photon (Komoot) — costuma ser mais rápido, também grátis e sem chave.
async function geocodePhoton(query) {
  const url = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 9000);
  if (!r.ok) throw new Error('photon ' + r.status);
  const d = await r.json();
  const f = d && d.features && d.features[0];
  if (!f || !f.geometry) throw new Error('photon vazio');
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties || {};
  const label = [p.name, p.city, p.state, p.country].filter(Boolean).join(', ');
  return { lat, lon, label };
}

// Geocodifica um texto (cidade, bairro) usando os dois provedores em paralelo
// e ficando com o primeiro que responder. -> { lat, lon, label }.
export async function geocode(query) {
  try {
    return await Promise.any([geocodePhoton(query), geocodeNominatim(query)]);
  } catch {
    throw new Error('Não encontrei esse local. Tente no formato "Bairro, Cidade" (ex.: Copacabana, Rio de Janeiro).');
  }
}

// Monta a query Overpass QL para um centro + raio + categorias.
export function buildQuery({ lat, lon, radius, categoryKeys }) {
  let selectors;
  if (!categoryKeys || categoryKeys.length === 0) {
    // padrão: qualquer loja + serviços comuns
    selectors = ['["shop"]', '["amenity"~"^(restaurant|cafe|bar|pub|fast_food|pharmacy|bank|fuel)$"]'];
  } else {
    selectors = [];
    for (const key of categoryKeys) {
      const cat = CATEGORIES.find((c) => c.key === key);
      if (cat) selectors.push(...cat.selectors);
    }
  }
  const body = selectors
    .map((sel) => `  nwr(around:${radius},${lat},${lon})${sel};`)
    .join('\n');

  return `[out:json][timeout:25];\n(\n${body}\n);\nout center 250;`;
}

// Tenta um espelho; devolve os elementos ou lança erro (marcando "ocupado").
async function attemptMirror(url, body) {
  const r = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    18000
  );
  if (r.status === 429 || r.status === 504) {
    const e = new Error('ocupado');
    e.busy = true;
    throw e;
  }
  if (!r.ok) throw new Error('Overpass respondeu ' + r.status);
  const data = await r.json();
  return data.elements || [];
}

// Dispara TODOS os espelhos em paralelo e usa o primeiro que responder.
export async function runOverpass(query) {
  const body = 'data=' + encodeURIComponent(query);
  try {
    return await Promise.any(OVERPASS_MIRRORS.map((url) => attemptMirror(url, body)));
  } catch (aggregate) {
    const errors = (aggregate && aggregate.errors) || [];
    if (errors.some((e) => e && e.busy)) {
      throw new Error('Servidores da Overpass ocupados agora. Aguarde alguns segundos e tente de novo.');
    }
    throw new Error('Não foi possível consultar a Overpass. Tente de novo.');
  }
}

function tag(tags, keys) {
  for (const k of keys) if (tags[k]) return tags[k];
  return '';
}

function buildAddress(tags) {
  const rua = tag(tags, ['addr:street']);
  const num = tag(tags, ['addr:housenumber']);
  const bairro = tag(tags, ['addr:suburb', 'addr:neighbourhood']);
  const cidade = tag(tags, ['addr:city', 'addr:town']);
  const linha1 = [rua, num].filter(Boolean).join(', ');
  return [linha1, bairro, cidade].filter(Boolean).join(' · ');
}

// Converte um elemento do OSM em lead normalizado.
export function toLead(el) {
  const tags = el.tags || {};
  const website = tag(tags, ['website', 'contact:website', 'url']);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  return {
    id: `${el.type}/${el.id}`,
    name: tags.name || '',
    category:
      tags.shop || tags.amenity || tags.leisure || tags.tourism || tags.craft || tags.office || '',
    phone: tag(tags, ['phone', 'contact:phone', 'contact:mobile']),
    website,
    hasWebsite: !!website,
    address: buildAddress(tags),
    lat,
    lon,
    osm: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
}

// Busca completa: geocode + overpass + normalização (só comércios com nome).
export async function search({ query, radius, categoryKeys }) {
  const place = await geocode(query);
  const q = buildQuery({ lat: place.lat, lon: place.lon, radius, categoryKeys });
  const elements = await runOverpass(q);

  const seen = new Set();
  const leads = [];
  for (const el of elements) {
    const lead = toLead(el);
    if (!lead.name || lead.lat == null) continue;
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    leads.push(lead);
  }
  leads.sort((a, b) => {
    if (a.hasWebsite !== b.hasWebsite) return a.hasWebsite ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return { place, leads };
}
