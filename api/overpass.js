// Proxy serverless da Overpass (Vercel). O navegador chama /api/overpass na
// MESMA origem (sem CORS) e aqui tentamos vários espelhos GLOBAIS, com
// repetição automática quando estão ocupados.
//
// IMPORTANTE: só espelhos GLOBAIS. Espelhos regionais (ex.: overpass.osm.ch =
// só Suíça) respondem 200 com 0 resultados fora da região e dariam falso-vazio.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const ROUNDS = 2; // nº de passadas por todos os espelhos
const BACKOFF_MS = 2000; // espera entre as passadas quando tudo está ocupado
const PER_MIRROR_MS = 8000;

export const config = { maxDuration: 60 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function timeout(ms) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(id) };
}

// Consulta um espelho; devolve {elements} | {busy:true} | {} (falha/ignorar).
async function tryMirror(url, body) {
  const t = timeout(PER_MIRROR_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: t.signal,
    });
    t.clear();
    if (r.status === 429 || r.status === 503 || r.status === 504) return { busy: true };
    if (!r.ok) return {};
    const data = await r.json();
    return { elements: data.elements || [] };
  } catch {
    t.clear();
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  let query = '';
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    query = b.query || '';
  } catch {
    query = '';
  }
  if (!query) return res.status(400).json({ error: 'query vazia' });

  const body = 'data=' + encodeURIComponent(query);
  let busy = false;
  let sawEmpty = false; // algum espelho respondeu OK, porém vazio

  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await sleep(BACKOFF_MS);
    // dispara todos os espelhos em paralelo (rodada limitada ao mais lento)
    const settled = await Promise.all(MIRRORS.map((url) => tryMirror(url, body)));
    const withData = settled.find((s) => s.elements && s.elements.length > 0);
    if (withData) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json({ elements: withData.elements });
    }
    if (settled.some((s) => s.elements)) sawEmpty = true; // 200 porém vazio
    if (settled.some((s) => s.busy)) busy = true;
  }

  // Nenhum espelho trouxe resultados: se algum respondeu OK-vazio, é vazio real.
  if (sawEmpty) {
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).json({ elements: [] });
  }
  return res.status(busy ? 429 : 502).json({ error: busy ? 'ocupado' : 'indisponivel' });
}
