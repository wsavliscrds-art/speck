// Cliente da API do google-maps-scraper (gosom).
// Fluxo: cria um job -> aguarda terminar -> baixa o CSV -> normaliza em leads.
import { config } from './config.js';
import { csvToObjects } from './csv.js';

const base = config.scraperBaseUrl;

async function api(pathname, options = {}) {
  const url = `${base}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Scraper respondeu ${res.status} em ${pathname}: ${body.slice(0, 300)}`);
  }
  return res;
}

// Cria um job de scraping. Retorna o objeto do job (com id).
export async function createJob(query, opts = {}) {
  const payload = {
    name: opts.name || query,
    keywords: [query],
    lang: opts.lang || config.defaultLang,
    zoom: opts.zoom ?? 15,
    depth: opts.depth ?? config.scraper.depth,
    max_time: opts.maxTime ?? config.scraper.maxTime,
    email: opts.email ?? false,
    fast_mode: opts.fastMode ?? false,
    radius: opts.radius ?? 10000,
    lat: opts.lat || '',
    lon: opts.lon || '',
    proxies: opts.proxies || [],
  };

  const res = await api('/api/v1/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const job = await res.json();
  // a API pode devolver { id } ou o job inteiro
  return job;
}

export async function getJob(id) {
  const res = await api(`/api/v1/jobs/${id}`);
  return res.json();
}

export async function downloadCsv(id) {
  const res = await api(`/api/v1/jobs/${id}/download`);
  return res.text();
}

// Espera o job terminar (status "ok") ou falhar ("failed").
export async function waitForJob(id, { onProgress } = {}) {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await getJob(id);
    const status = String(job.status || '').toLowerCase();
    if (onProgress) onProgress(status);

    if (status === 'ok') return job;
    if (status === 'failed') throw new Error(`Job ${id} falhou no scraper.`);

    if (Date.now() - started > config.scraper.pollTimeoutMs) {
      throw new Error(`Tempo esgotado esperando o job ${id} (status: ${status}).`);
    }
    await sleep(config.scraper.pollIntervalMs);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pega o primeiro valor não-vazio entre várias chaves possíveis (o CSV do
// scraper muda de nome de coluna entre versões).
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

// Converte uma linha crua do CSV do scraper em um lead normalizado.
export function normalizeRow(row, query) {
  // normaliza chaves para minúsculas
  const r = {};
  for (const [k, v] of Object.entries(row)) r[k.toLowerCase().trim()] = v;

  const website = pick(r, ['website', 'site', 'web']);
  const name = pick(r, ['title', 'name']);
  const rating = pick(r, ['review_rating', 'rating', 'stars']);
  const reviews = pick(r, ['review_count', 'reviews', 'reviews_count']);

  return {
    name,
    category: pick(r, ['category', 'categories', 'type']),
    address: pick(r, ['address', 'complete_address', 'full_address']),
    phone: pick(r, ['phone', 'phone_number', 'telephone']),
    website,
    email: pick(r, ['email', 'emails']),
    maps_link: pick(r, ['link', 'url', 'google_maps_url']),
    rating: rating ? Number(String(rating).replace(',', '.')) || null : null,
    reviews: reviews ? Number(String(reviews).replace(/[^\d]/g, '')) || 0 : 0,
    latitude: pick(r, ['latitude', 'lat']),
    longitude: pick(r, ['longitude', 'lon', 'lng']),
    // regra central da prospecção: sem site = lead quente
    has_website: website !== '',
    query,
  };
}

// Executa uma busca completa: cria job, espera, baixa e normaliza.
export async function runSearch(query, opts = {}) {
  const job = await createJob(query, opts);
  const jobId = job.id || job.ID || job.job_id;
  if (!jobId) throw new Error('O scraper não retornou um id de job.');

  await waitForJob(jobId, opts);
  const csv = await downloadCsv(jobId);
  const rows = csvToObjects(csv);
  const leads = rows
    .map((row) => normalizeRow(row, query))
    .filter((l) => l.name); // descarta linhas sem nome

  return { jobId, total: leads.length, leads };
}
