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

// Geocodifica um texto (cidade, bairro) -> { lat, lon, label }.
export async function geocode(query) {
  const url = `${NOMINATIM}?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Falha no geocoding (Nominatim).');
  const data = await r.json();
  if (!data || data.length === 0) throw new Error('Local não encontrado.');
  const first = data[0];
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    label: first.display_name,
  };
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

  return `[out:json][timeout:30];\n(\n${body}\n);\nout center 400;`;
}

// Executa a query tentando os espelhos em sequência.
export async function runOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (r.status === 429 || r.status === 504) {
        lastErr = new Error('Servidor Overpass ocupado (limite de uso).');
        continue; // tenta o próximo espelho
      }
      if (!r.ok) {
        lastErr = new Error('Overpass respondeu ' + r.status);
        continue;
      }
      const data = await r.json();
      return data.elements || [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Não foi possível consultar a Overpass.');
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
