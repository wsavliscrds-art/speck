import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORIES } from './overpass.js';
import { searchAll } from './sources.js';
import { saveLead, savedExtIds } from './crm.js';
import { TopNav } from './Nav.jsx';

const RADIUS_OPTS = [
  { v: 800, label: '800 m' },
  { v: 1500, label: '1,5 km' },
  { v: 3000, label: '3 km' },
  { v: 5000, label: '5 km' },
];

export default function MapView({ tab, setTab, email, onLogout }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markerById = useRef({});

  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState(1500);
  const [cats, setCats] = useState(['restaurant', 'bakery', 'beauty', 'market']);
  const [onlyWithoutSite, setOnlyWithoutSite] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState('todos');
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [saved, setSaved] = useState(new Set());

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

  // já salvos no funil (para marcar os cartões)
  useEffect(() => {
    savedExtIds().then(setSaved).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    let out = onlyWithoutSite ? leads.filter((l) => !l.hasWebsite) : leads;
    if (phoneFilter === 'com') out = out.filter((l) => l.phone);
    else if (phoneFilter === 'sem') out = out.filter((l) => !l.phone);
    return out;
  }, [leads, onlyWithoutSite, phoneFilter]);

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

  const stats = useMemo(() => ({
    total: leads.length,
    semSite: leads.filter((l) => !l.hasWebsite).length,
  }), [leads]);

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

  async function onSave(lead) {
    try {
      await saveLead(lead);
      setSaved((prev) => new Set(prev).add(lead.id));
    } catch (e) {
      setError(e.message || 'Não foi possível salvar.');
    }
  }

  return (
    <div className="app">
      <div ref={mapEl} className="map" />

      <header className="chrome topbar">
        <TopNav tab={tab} setTab={setTab} email={email} onLogout={onLogout} savedCount={saved.size} />
        <form className="searchform" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cidade, bairro ou região…"
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

      {busy && <div className="chrome loading">Buscando no OpenStreetMap… (alguns segundos)</div>}
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
              saved={saved.has(lead.id)}
              onClick={() => focusLead(lead)}
              onSave={() => onSave(lead)}
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

function LeadCard({ lead, active, saved, onClick, onSave }) {
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
        <button className={`act act-save ${saved ? 'is-saved' : ''}`} onClick={onSave} disabled={saved}>
          {saved ? '✓ No funil' : '+ Salvar'}
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
