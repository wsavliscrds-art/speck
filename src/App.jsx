import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORIES, matchesCategories } from './overpass.js';
import { searchAll } from './sources.js';

const RADIUS_OPTS = [
  { v: 800, label: '800 m' },
  { v: 1500, label: '1,5 km' },
  { v: 3000, label: '3 km' },
  { v: 5000, label: '5 km' },
];

const STATUS_KEY = 'semsite:status';
const loadStatus = () => {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); } catch { return {}; }
};
const saveStatus = (m) => {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

export default function App() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markerById = useRef({});

  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState(1500);
  // vazio = todos os tipos (traz o máximo). Clicar num chip filtra por tipo.
  const [cats, setCats] = useState([]);
  const [onlyWithoutSite, setOnlyWithoutSite] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState('todos');
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [status, setStatus] = useState(loadStatus);

  useEffect(() => {
    const map = L.map(mapEl.current, { zoomControl: false }).setView([-14.235, -51.925], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => map.remove();
  }, []);

  const shown = useMemo(() => {
    let out = leads.filter((l) => matchesCategories(l, cats));
    if (onlyWithoutSite) out = out.filter((l) => !l.hasWebsite);
    if (phoneFilter === 'com') out = out.filter((l) => l.phone);
    else if (phoneFilter === 'sem') out = out.filter((l) => !l.phone);
    return out;
  }, [leads, cats, onlyWithoutSite, phoneFilter]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markerById.current = {};
    const pts = [];
    for (const l of shown) {
      if (l.lat == null) continue;
      const m = L.circleMarker([l.lat, l.lon], {
        radius: 7,
        weight: 2,
        color: l.hasWebsite ? '#8E8E93' : '#34C759',
        fillColor: l.hasWebsite ? '#8E8E93' : '#34C759',
        fillOpacity: 0.85,
      });
      m.bindPopup(`<strong>${escapeHtml(l.name)}</strong><br>${escapeHtml(l.category)}`);
      m.on('click', () => setSelected(l));
      m.addTo(layer);
      markerById.current[l.id] = m;
      pts.push([l.lat, l.lon]);
    }
    if (pts.length) mapRef.current.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
  }, [shown]);

  const stats = useMemo(() => {
    const inCats = leads.filter((l) => matchesCategories(l, cats));
    return { total: inCats.length, semSite: inCats.filter((l) => !l.hasWebsite).length };
  }, [leads, cats]);

  const runSearch = useCallback(async () => {
    if (!query.trim() || busy) return;
    setError('');
    setBusy(true);
    setLeads([]);
    setSelected(null);
    setSources([]);
    try {
      const { place, leads: found, sources: srcs } = await searchAll({
        query: query.trim(), radius, categoryKeys: cats,
      });
      mapRef.current.setView([place.lat, place.lon], 14);
      setLeads(found);
      setSources(srcs || []);
      setSheetOpen(true);
      if (found.length === 0) setError('Nenhum comércio encontrado. Tente aumentar o raio ou trocar as categorias.');
    } catch (e) {
      const msg = e && (e.name === 'AbortError' || /abort/i.test(e.message || ''))
        ? 'A busca demorou demais e foi interrompida. Tente de novo, com um raio menor.'
        : (e.message || 'Falha na busca.');
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [query, radius, cats, busy]);

  const toggleCat = (key) =>
    setCats((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  function focusLead(lead) {
    setSelected(lead);
    if (lead.lat != null) {
      mapRef.current.setView([lead.lat, lead.lon], 17, { animate: true });
      const m = markerById.current[lead.id];
      if (m) m.openPopup();
    }
  }

  function cycleStatus(lead) {
    setStatus((prev) => {
      const order = ['', 'contatado', 'fechado'];
      const cur = prev[lead.id] || '';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      const updated = { ...prev, [lead.id]: next };
      saveStatus(updated);
      return updated;
    });
  }

  return (
    <div className="app">
      <div ref={mapEl} className="map" />

      <div className="topchrome">
        <header className="chrome topbar">
          <div className="brand">
            <span className="pin">📍</span>
            <div className="brand-txt">
              <strong>Sem Site</strong>
              <small>Comércios sem site</small>
            </div>
          </div>
          <form className="searchform" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔎 Cidade, bairro ou região…"
              aria-label="Local"
            />
            <select className="radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Raio">
              {RADIUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '…' : 'Buscar'}
            </button>
          </form>
        </header>

        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`chip ${cats.includes(c.key) ? 'chip-on' : ''}`}
              onClick={() => toggleCat(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {busy && <div className="chrome loading">Buscando comércios… (alguns segundos)</div>}
      {error && <div className="chrome toast-error">{error}</div>}

      <section className={`chrome sheet ${sheetOpen ? 'open' : 'closed'}`}>
        <button className="sheet-grab" onClick={() => setSheetOpen((v) => !v)} aria-label="Alternar painel" />
        <div className="sheet-head">
          <div className="stat-row">
            <Stat value={stats.total} label="comércios" />
            <Stat value={stats.semSite} label="sem site" hot />
          </div>
          <label className="switch">
            <input type="checkbox" checked={onlyWithoutSite} onChange={(e) => setOnlyWithoutSite(e.target.checked)} />
            <span>Só sem site</span>
          </label>
        </div>

        <div className="filter-row">
          <span className="filter-label">Telefone</span>
          <select className="radius" value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="com">Só com telefone</option>
            <option value="sem">Só sem telefone</option>
          </select>
        </div>

        {sources.length > 0 && (
          <div className="sources">Fontes ativas: {sources.join(' · ')}</div>
        )}

        <div className="list">
          {shown.length === 0 && !busy && (
            <p className="empty">Busque uma cidade ou bairro para ver os comércios sem site no mapa.</p>
          )}
          {shown.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              active={selected && selected.id === lead.id}
              status={status[lead.id] || ''}
              onClick={() => focusLead(lead)}
              onStatus={() => cycleStatus(lead)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label, hot }) {
  return (
    <div className={`stat ${hot ? 'stat-hot' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function waLink(phone) {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('55')) d = '55' + d;
  return `https://wa.me/${d}`;
}

function LeadCard({ lead, active, status, onClick, onStatus }) {
  const wa = waLink(lead.phone);
  return (
    <article className={`lead ${active ? 'lead-active' : ''} ${lead.hasWebsite ? '' : 'lead-hot'}`}>
      <div className="lead-main" onClick={onClick}>
        <div className="lead-top">
          <h3>{lead.name}</h3>
          {!lead.hasWebsite && <span className="tag">SEM SITE</span>}
        </div>
        <div className="lead-sub">{[lead.category, lead.address].filter(Boolean).join(' · ')}</div>
        {lead.phone && <div className="lead-phone">{lead.phone}</div>}
      </div>
      <div className="lead-actions">
        {wa && <a className="act act-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {lead.phone && <a className="act" href={'tel:' + lead.phone.replace(/[^\d+]/g, '')}>Ligar</a>}
        <a className="act" href={lead.osm} target="_blank" rel="noreferrer">Mapa</a>
        <button className={`act act-status s-${status || 'novo'}`} onClick={onStatus}>
          {status === 'contatado' ? 'Contatado' : status === 'fechado' ? 'Fechado' : 'Marcar'}
        </button>
      </div>
    </article>
  );
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
