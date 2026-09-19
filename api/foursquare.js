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

  const url =
    `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}` +
    `&radius=${radius}&limit=50&fields=fsq_id,name,tel,website,location,geocodes,categories`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: key, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Foursquare ' + r.status, results: [] });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ results: data.results || [] });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e), results: [] });
  }
}
