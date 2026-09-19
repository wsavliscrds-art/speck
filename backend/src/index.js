import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { runSearch } from './scraper.js';
import {
  upsertLeads,
  listLeads,
  getLead,
  updateLead,
  deleteLead,
  stats,
  createJobRecord,
  updateJobRecord,
  getJobRecord,
  listJobRecords,
} from './store.js';
import { objectsToCsv } from './csv.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// --- saúde -------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  let scraperOk = false;
  try {
    const r = await fetch(`${config.scraperBaseUrl}/api/v1/jobs`);
    scraperOk = r.ok;
  } catch {
    scraperOk = false;
  }
  res.json({ ok: true, scraper: scraperOk, scraperUrl: config.scraperBaseUrl });
});

// --- disparar uma busca (assíncrona) ----------------------------------------
app.post('/api/search', (req, res) => {
  const { query, lang, depth, zoom, lat, lon, radius } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: 'Informe "query" (ex.: "restaurantes em Campinas").' });
  }

  const job = createJobRecord(String(query).trim());

  // roda em segundo plano; o front acompanha por GET /api/jobs/:id
  runSearchJob(job.id, String(query).trim(), { lang, depth, zoom, lat, lon, radius }).catch(
    (err) => {
      updateJobRecord(job.id, { status: 'erro', error: String(err.message || err) });
    }
  );

  res.status(202).json(job);
});

async function runSearchJob(jobId, query, opts) {
  updateJobRecord(jobId, { status: 'rodando' });
  const result = await runSearch(query, {
    lang: opts.lang,
    depth: opts.depth ? Number(opts.depth) : undefined,
    zoom: opts.zoom ? Number(opts.zoom) : undefined,
    lat: opts.lat,
    lon: opts.lon,
    radius: opts.radius ? Number(opts.radius) : undefined,
    onProgress: (s) => updateJobRecord(jobId, { scraper_job: s }),
  });

  const { imported, withoutSite } = upsertLeads(result.leads);
  updateJobRecord(jobId, {
    status: 'concluido',
    total: result.total,
    without_site: withoutSite,
    imported,
    scraper_job: result.jobId,
  });
}

// --- jobs --------------------------------------------------------------------
app.get('/api/jobs', (req, res) => res.json(listJobRecords()));
app.get('/api/jobs/:id', (req, res) => {
  const job = getJobRecord(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });
  res.json(job);
});

// --- leads -------------------------------------------------------------------
app.get('/api/leads', (req, res) => {
  const leads = listLeads({
    onlyWithoutSite: req.query.onlyWithoutSite === 'true' || req.query.onlyWithoutSite === '1',
    status: req.query.status,
    q: req.query.q,
    minRating: req.query.minRating,
    limit: req.query.limit,
  });
  res.json(leads);
});

app.get('/api/leads/export.csv', (req, res) => {
  const leads = listLeads({
    onlyWithoutSite: req.query.onlyWithoutSite === 'true' || req.query.onlyWithoutSite === '1',
    status: req.query.status,
    q: req.query.q,
    minRating: req.query.minRating,
    limit: 5000,
  });
  const columns = [
    'name', 'category', 'phone', 'email', 'address', 'website',
    'has_website', 'rating', 'reviews', 'status', 'notes', 'maps_link', 'query',
  ];
  const csv = objectsToCsv(leads, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-leadmapa.csv"');
  res.send('﻿' + csv); // BOM p/ acentos no Excel
});

app.get('/api/leads/:id', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(lead);
});

app.patch('/api/leads/:id', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(updateLead(req.params.id, req.body || {}));
});

app.delete('/api/leads/:id', (req, res) => {
  deleteLead(req.params.id);
  res.json({ ok: true });
});

// --- estatísticas ------------------------------------------------------------
app.get('/api/stats', (req, res) => res.json(stats()));

app.listen(config.port, () => {
  console.log(`LeadMapa API rodando em http://localhost:${config.port}`);
  console.log(`Scraper esperado em ${config.scraperBaseUrl}`);
});
