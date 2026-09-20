// Proxy serverless do Foursquare (Vercel). A chave fica só no servidor
// (env FOURSQUARE_KEY). Se não houver chave, responde 501 e o app ignora
// esta fonte silenciosamente.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const key = process.env.FOURSQUARE_KEY;
  if (!key) return res.status(501).json({ error: 'Foursquare não configurado.' });

  let lat, lon, radius;
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    lat = Number(b.lat);
    lon = Number(b.lon);
    radius = Math.min(Math.max(Number(b.radius) || 1500, 100), 100000);
  } catch {
    return res.status(400).json({ error: 'parâmetros inválidos' });
  }
  if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'lat/lon inválidos' });

  // API NOVA do Foursquare (a v3 foi desativada -> 410). Novo host + Bearer +
  // cabeçalho de versão. Chave = Service Key do painel novo do Foursquare.
  const url =
    `https://places-api.foursquare.com/places/search?ll=${lat},${lon}` +
    `&radius=${radius}&limit=50&fields=fsq_place_id,name,tel,website,location,latitude,longitude,categories`;

  const withTimeout = async (headers) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    try {
      return await fetch(url, { headers: { ...headers, Accept: 'application/json' }, signal: c.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // 2 tentativas rápidas: chave nova (Bearer) e chave crua, ambas com versão.
  const variants = [
    { Authorization: `Bearer ${key}`, 'X-Places-Api-Version': '2025-06-17' },
    { Authorization: key, 'X-Places-Api-Version': '2025-06-17' },
  ];

  let last = { status: 0, body: '' };
  for (const headers of variants) {
    try {
      const r = await withTimeout(headers);
      if (r.ok) {
        const data = await r.json();
        res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
        return res.status(200).json({ results: data.results || [] });
      }
      last = { status: r.status, body: (await r.text().catch(() => '')) };
      if (r.status !== 401 && r.status !== 403) break;
    } catch (e) {
      last = { status: -1, body: String(e.message || e) };
    }
  }
  return res.status(502).json({ error: 'Foursquare ' + last.status, detail: (last.body || '').slice(0, 200), results: [] });
}
