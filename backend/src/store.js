// Persistência em SQLite: leads (com deduplicação e status de contato) e jobs
// de busca (para acompanhar o scraping de forma assíncrona).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

// garante que a pasta do banco existe
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key   TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    category     TEXT,
    address      TEXT,
    phone        TEXT,
    website      TEXT,
    email        TEXT,
    maps_link    TEXT,
    rating       REAL,
    reviews      INTEGER DEFAULT 0,
    latitude     TEXT,
    longitude    TEXT,
    has_website  INTEGER DEFAULT 0,
    query        TEXT,
    status       TEXT DEFAULT 'novo',
    notes        TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leads_has_website ON leads(has_website);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    query         TEXT NOT NULL,
    status        TEXT DEFAULT 'na_fila',
    scraper_job   TEXT,
    total         INTEGER DEFAULT 0,
    without_site  INTEGER DEFAULT 0,
    imported      INTEGER DEFAULT 0,
    error         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
`);

// ---- Deduplicação -----------------------------------------------------------
function dedupeKey(lead) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (lead.maps_link) return 'm:' + norm(lead.maps_link);
  if (lead.phone) return 'p:' + norm(lead.phone).replace(/[^\d]/g, '');
  return 'n:' + norm(lead.name) + '|' + norm(lead.address);
}

// ---- Leads ------------------------------------------------------------------
const insertLead = db.prepare(`
  INSERT INTO leads
    (dedupe_key, name, category, address, phone, website, email, maps_link,
     rating, reviews, latitude, longitude, has_website, query)
  VALUES
    (@dedupe_key, @name, @category, @address, @phone, @website, @email, @maps_link,
     @rating, @reviews, @latitude, @longitude, @has_website, @query)
  ON CONFLICT(dedupe_key) DO UPDATE SET
    phone       = COALESCE(NULLIF(excluded.phone,''), leads.phone),
    website     = COALESCE(NULLIF(excluded.website,''), leads.website),
    email       = COALESCE(NULLIF(excluded.email,''), leads.email),
    rating      = COALESCE(excluded.rating, leads.rating),
    reviews     = MAX(excluded.reviews, leads.reviews),
    has_website = MAX(excluded.has_website, leads.has_website),
    updated_at  = datetime('now')
`);

// Insere/atualiza vários leads. Retorna quantos são "sem site".
export function upsertLeads(leads) {
  let withoutSite = 0;
  const tx = db.transaction((items) => {
    for (const l of items) {
      const row = {
        dedupe_key: dedupeKey(l),
        name: l.name || '',
        category: l.category || '',
        address: l.address || '',
        phone: l.phone || '',
        website: l.website || '',
        email: l.email || '',
        maps_link: l.maps_link || '',
        rating: l.rating ?? null,
        reviews: l.reviews ?? 0,
        latitude: l.latitude || '',
        longitude: l.longitude || '',
        has_website: l.has_website ? 1 : 0,
        query: l.query || '',
      };
      insertLead.run(row);
      if (!l.has_website) withoutSite++;
    }
  });
  tx(leads);
  return { imported: leads.length, withoutSite };
}

// Lista leads com filtros. filters: { onlyWithoutSite, status, q, minRating }
export function listLeads(filters = {}) {
  const where = [];
  const params = {};

  if (filters.onlyWithoutSite) where.push('has_website = 0');
  if (filters.status && filters.status !== 'todos') {
    where.push('status = @status');
    params.status = filters.status;
  }
  if (filters.minRating != null && filters.minRating !== '') {
    where.push('(rating IS NOT NULL AND rating >= @minRating)');
    params.minRating = Number(filters.minRating);
  }
  if (filters.q) {
    where.push('(name LIKE @q OR category LIKE @q OR address LIKE @q OR query LIKE @q)');
    params.q = '%' + filters.q + '%';
  }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(filters.limit) || 500, 2000);
  const stmt = db.prepare(
    `SELECT * FROM leads ${clause} ORDER BY has_website ASC, reviews DESC, updated_at DESC LIMIT ${limit}`
  );
  return stmt.all(params);
}

export function getLead(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function updateLead(id, fields) {
  const allowed = ['status', 'notes', 'phone', 'website', 'email'];
  const sets = [];
  const params = { id };
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = @${key}`);
      params[key] = fields[key];
    }
  }
  if (!sets.length) return getLead(id);
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getLead(id);
}

export function deleteLead(id) {
  return db.prepare('DELETE FROM leads WHERE id = ?').run(id);
}

// Estatísticas para o painel
export function stats() {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN has_website = 0 THEN 1 ELSE 0 END) AS sem_site,
        SUM(CASE WHEN status = 'contatado' THEN 1 ELSE 0 END) AS contatados,
        SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) AS fechados
       FROM leads`
    )
    .get();
  return {
    total: row.total || 0,
    sem_site: row.sem_site || 0,
    contatados: row.contatados || 0,
    fechados: row.fechados || 0,
  };
}

// ---- Jobs -------------------------------------------------------------------
export function createJobRecord(query) {
  const id = randomUUID();
  db.prepare('INSERT INTO jobs (id, query, status) VALUES (?, ?, ?)').run(id, query, 'na_fila');
  return getJobRecord(id);
}

export function updateJobRecord(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getJobRecord(id);
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE jobs SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({
    ...fields,
    id,
  });
  return getJobRecord(id);
}

export function getJobRecord(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

export function listJobRecords(limit = 20) {
  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit);
}

export default db;
