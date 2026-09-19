import React, { useEffect, useState, useCallback } from 'react';
import { api, whatsappLink, telLink, STATUS, statusMeta } from './api.js';

const JOB_LABEL = {
  na_fila: 'Na fila…',
  rodando: 'Buscando no Google Maps…',
  concluido: 'Concluído',
  erro: 'Erro',
};

export default function App() {
  const [query, setQuery] = useState('');
  const [job, setJob] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, sem_site: 0, contatados: 0, fechados: 0 });
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    onlyWithoutSite: true,
    status: 'todos',
    q: '',
    minRating: '',
  });

  const refresh = useCallback(async () => {
    try {
      const [ls, st] = await Promise.all([api.listLeads(filters), api.stats()]);
      setLeads(ls);
      setStats(st);
    } catch (e) {
      setError(e.message);
    }
  }, [filters]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false, scraper: false }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // acompanha o job de busca até concluir
  useEffect(() => {
    if (!job || job.status === 'concluido' || job.status === 'erro') return;
    const t = setInterval(async () => {
      try {
        const j = await api.getJob(job.id);
        setJob(j);
        if (j.status === 'concluido') {
          setLoading(false);
          refresh();
        } else if (j.status === 'erro') {
          setLoading(false);
          setError('A busca falhou: ' + (j.error || 'erro no scraper'));
        }
      } catch (e) {
        setError(e.message);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [job, refresh]);

  async function onSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setError('');
    setLoading(true);
    try {
      const j = await api.startSearch(query.trim());
      setJob(j);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function changeStatus(lead, status) {
    const updated = await api.updateLead(lead.id, { status });
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
    api.stats().then(setStats);
  }

  async function saveNotes(lead, notes) {
    const updated = await api.updateLead(lead.id, { notes });
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
  }

  const running = loading || (job && job.status !== 'concluido' && job.status !== 'erro');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">📍</span>
          <div>
            <h1>LeadMapa</h1>
            <p>Empresas locais que ainda não têm site</p>
          </div>
        </div>
        <HealthPill health={health} />
      </header>

      <form className="searchbar" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ex.: "restaurantes em Campinas", "salão de beleza São Paulo"'
          aria-label="Busca"
        />
        <button type="submit" disabled={running}>
          {running ? 'Buscando…' : '🔎 Buscar no Maps'}
        </button>
      </form>

      {job && (job.status !== 'concluido' || job.without_site > 0) && (
        <div className={`jobbar ${job.status}`}>
          <span className="dot" />
          <span>
            <strong>{JOB_LABEL[job.status] || job.status}</strong>
            {job.status === 'concluido' && (
              <> — {job.total} empresas, <b>{job.without_site} sem site</b> importadas.</>
            )}
            {job.status === 'rodando' && ' isso pode levar alguns minutos.'}
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <section className="stats">
        <Stat label="Total de leads" value={stats.total} />
        <Stat label="Sem site 🔥" value={stats.sem_site} highlight />
        <Stat label="Contatados" value={stats.contatados} />
        <Stat label="Fechados" value={stats.fechados} />
      </section>

      <section className="filters">
        <label className="chk">
          <input
            type="checkbox"
            checked={filters.onlyWithoutSite}
            onChange={(e) => setFilters((f) => ({ ...f, onlyWithoutSite: e.target.checked }))}
          />
          Só quem não tem site
        </label>

        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="todos">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={filters.minRating}
          onChange={(e) => setFilters((f) => ({ ...f, minRating: e.target.value }))}
        >
          <option value="">Qualquer nota</option>
          <option value="3">Nota ≥ 3</option>
          <option value="4">Nota ≥ 4</option>
          <option value="4.5">Nota ≥ 4,5</option>
        </select>

        <input
          className="search-mini"
          placeholder="Filtrar por nome/categoria…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />

        <a className="export" href={api.exportUrl(filters)}>⬇️ Exportar CSV</a>
      </section>

      <section className="leads">
        {leads.length === 0 && !running && (
          <div className="empty">
            Nenhum lead ainda. Faça uma busca acima para trazer empresas reais do Google Maps.
          </div>
        )}
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onStatus={changeStatus}
            onNotes={saveNotes}
          />
        ))}
      </section>

      <footer className="foot">
        Dados reais via google-maps-scraper. Use com responsabilidade (LGPD/GDPR).
      </footer>
    </div>
  );
}

function HealthPill({ health }) {
  if (!health) return <span className="pill pill-gray">conectando…</span>;
  if (!health.ok) return <span className="pill pill-red">API offline</span>;
  return health.scraper ? (
    <span className="pill pill-green">scraper ok</span>
  ) : (
    <span className="pill pill-amber">scraper offline</span>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`stat ${highlight ? 'stat-hot' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function LeadCard({ lead, onStatus, onNotes }) {
  const [notes, setNotes] = useState(lead.notes || '');
  const meta = statusMeta(lead.status);
  const wa = whatsappLink(lead.phone);
  const tel = telLink(lead.phone);

  return (
    <article className={`lead ${lead.has_website ? '' : 'lead-hot'}`}>
      <div className="lead-head">
        <h3>{lead.name}</h3>
        {!lead.has_website && <span className="badge-hot">SEM SITE</span>}
      </div>

      <div className="lead-meta">
        {lead.category && <span>{lead.category}</span>}
        {lead.rating != null && (
          <span>⭐ {lead.rating} ({lead.reviews})</span>
        )}
      </div>

      {lead.address && <p className="lead-addr">{lead.address}</p>}
      {lead.phone && <p className="lead-phone">📞 {lead.phone}</p>}

      <div className="lead-actions">
        {wa && (
          <a className="btn btn-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
        )}
        {tel && <a className="btn btn-ghost" href={tel}>Ligar</a>}
        {lead.maps_link && (
          <a className="btn btn-ghost" href={lead.maps_link} target="_blank" rel="noreferrer">
            Maps
          </a>
        )}
        {lead.has_website && (
          <a className="btn btn-ghost" href={lead.website} target="_blank" rel="noreferrer">
            Site
          </a>
        )}
      </div>

      <div className="lead-foot">
        <select
          value={lead.status}
          onChange={(e) => onStatus(lead, e.target.value)}
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          className="notes"
          placeholder="Anotações…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (lead.notes || '') && onNotes(lead, notes)}
        />
      </div>
    </article>
  );
}
