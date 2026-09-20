// Orquestra VÁRIAS fontes de dados gratuitas em paralelo e junta os resultados.
//  1) OpenStreetMap / Overpass  — sem chave (sempre ligada)
//  2) Geoapify                  — chave grátis em VITE_GEOAPIFY_KEY (navegador)
//  3) Foursquare                — chave grátis no servidor (/api/foursquare)
// A que trouxer dados entra; os resultados são unificados e deduplicados.
import { geocode, searchOverpass } from './overpass.js';

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY || '';

// ---- helpers ----------------------------------------------------------------
async function fetchTimeout(url, options, ms) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: c.signal });
  } finally {
    clearTimeout(id);
  }
}

// embrulha uma promessa de provedor: nunca lança; devolve {source, ok, leads}.
async function safe(source, promise) {
  try {
    const leads = await promise;
    return { source, ok: true, leads: leads || [] };
  } catch (e) {
    return { source, ok: false, leads: [], error: e && e.message };
  }
}

function mapLink(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}

// ---- Geoapify (mesmos dados do OSM, servidor estável) -----------------------
// Categorias AMPLAS e garantidas (top-level válidas). Categoria inválida faz a
// Geoapify recusar a busca inteira, então usamos só as seguras e abrangentes:
//   commercial = lojas | catering = restaurantes/cafés/bares |
//   accommodation = hotéis | healthcare = farmácias/saúde
const GEOAPIFY_CATS = ['commercial', 'catering', 'accommodation', 'healthcare', 'service', 'office'];

async function searchGeoapify({ lat, lon, radius }) {
  if (!GEOAPIFY_KEY) return [];
  const cats = GEOAPIFY_CATS;

  const url =
    `https://api.geoapify.com/v2/places?categories=${cats.join(',')}` +
    `&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}` +
    `&limit=500&apiKey=${GEOAPIFY_KEY}`;

  const r = await fetchTimeout(url, { headers: { Accept: 'application/json' } }, 16000);
  if (!r.ok) throw new Error('Geoapify ' + r.status);
  const data = await r.json();
  const out = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    const raw = (p.datasource && p.datasource.raw) || {};
    const website = p.website || raw.website || raw['contact:website'] || raw.url || '';
    const la = p.lat ?? (f.geometry && f.geometry.coordinates && f.geometry.coordinates[1]);
    const lo = p.lon ?? (f.geometry && f.geometry.coordinates && f.geometry.coordinates[0]);
    const name = p.name || raw.name || '';
    if (!name || la == null) continue;
    const catText = [
      ...(p.categories || []),
      raw.shop, raw.amenity, raw.tourism, raw.leisure, raw.craft, raw.office, raw.cuisine,
    ].filter(Boolean).join(' ').toLowerCase();
    out.push({
      id: 'geoapify/' + (p.place_id || `${la},${lo}`),
      name,
      category:
        raw.shop || raw.amenity || raw.tourism || raw.leisure || (p.categories && p.categories[0]) || '',
      catText,
      phone: (p.contact && p.contact.phone) || raw.phone || raw['contact:phone'] || '',
      website,
      hasWebsite: !!website,
      address: p.formatted || p.address_line2 || '',
      lat: la,
      lon: lo,
      osm: mapLink(la, lo),
      source: 'Geoapify',
    });
  }
  return out;
}

// ---- Foursquare (via proxy serverless; chave fica no servidor) --------------
async function searchFoursquare({ lat, lon, radius }) {
  const r = await fetchTimeout(
    '/api/foursquare',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, radius }),
    },
    16000
  );
  if (r.status === 404 || r.status === 501) return []; // sem proxy / sem chave
  if (!r.ok) throw new Error('Foursquare ' + r.status);
  const data = await r.json();
  const out = [];
  for (const p of data.results || []) {
    const g = (p.geocodes && p.geocodes.main) || {};
    const website = p.website || '';
    if (!p.name || g.latitude == null) continue;
    const catText = (p.categories || []).map((c) => c.name).join(' ').toLowerCase();
    out.push({
      id: 'fsq/' + p.fsq_id,
      name: p.name,
      category: (p.categories && p.categories[0] && p.categories[0].name) || '',
      catText,
      phone: p.tel || '',
      website,
      hasWebsite: !!website,
      address: (p.location && p.location.formatted_address) || '',
      lat: g.latitude,
      lon: g.longitude,
      osm: mapLink(g.latitude, g.longitude),
      source: 'Foursquare',
    });
  }
  return out;
}

// ---- Orquestrador ------------------------------------------------------------
function dedupeKey(l) {
  const n = String(l.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${n}|${Number(l.lat).toFixed(4)}|${Number(l.lon).toFixed(4)}`;
}

export async function searchAll({ query, radius, categoryKeys }) {
  const place = await geocode(query);
  const { lat, lon } = place;

  const results = await Promise.all([
    safe('OpenStreetMap', searchOverpass({ lat, lon, radius, categoryKeys })),
    safe('Geoapify', searchGeoapify({ lat, lon, radius, categoryKeys })),
    safe('Foursquare', searchFoursquare({ lat, lon, radius })),
  ]);

  // junta e deduplica (mantém o registro que tiver mais informação)
  const byKey = new Map();
  for (const res of results) {
    for (const lead of res.leads) {
      const key = dedupeKey(lead);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, lead);
      } else {
        // completa campos vazios com o de outra fonte
        prev.phone = prev.phone || lead.phone;
        prev.website = prev.website || lead.website;
        prev.hasWebsite = prev.hasWebsite || lead.hasWebsite;
        prev.address = prev.address || lead.address;
      }
    }
  }

  const leads = [...byKey.values()].sort((a, b) => {
    if (a.hasWebsite !== b.hasWebsite) return a.hasWebsite ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const sources = results.filter((r) => r.ok && r.leads.length > 0).map((r) => r.source);
  const anyOk = results.some((r) => r.ok);

  // se nenhum provedor respondeu (todos deram erro), avisa
  if (leads.length === 0 && !anyOk) {
    const busy = results.some((r) => r.error && /ocupad/i.test(r.error));
    throw new Error(
      busy
        ? 'As fontes de dados estão ocupadas agora. Aguarde ~10s e tente de novo.'
        : 'Não foi possível consultar as fontes de dados agora. Tente de novo.'
    );
  }

  return { place, leads, sources };
}
