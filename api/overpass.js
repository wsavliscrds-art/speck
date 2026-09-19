// Proxy serverless da Overpass (Vercel). O navegador chama /api/overpass na
// MESMA origem (sem problema de CORS) e aqui no servidor tentamos vários
// espelhos livremente — inclusive os que não mandam cabeçalho CORS.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export const config = { maxDuration: 30 };

function timeout(ms) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(id) };
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

  for (const url of MIRRORS) {
    const t = timeout(9000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: t.signal,
      });
      t.clear();
      if (r.status === 429 || r.status === 503 || r.status === 504) {
        busy = true;
        continue; // servidor ocupado: tenta o próximo espelho
      }
      if (!r.ok) continue;
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json({ elements: data.elements || [] });
    } catch (e) {
      t.clear(); // timeout ou erro de rede: próximo espelho
    }
  }

  return res.status(busy ? 429 : 502).json({ error: busy ? 'ocupado' : 'indisponivel' });
}
