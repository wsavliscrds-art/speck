import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  loadMapKit,
  searchRegion,
  sweepRegion,
  geocode,
  CATEGORIES,
  categoryLabel,
} from './mapkit.js';

const STATUS_KEY = 'semsite:status';

function loadStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveStatus(map) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const mkRef = useRef(null);
  const annRef = useRef([]);

  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState(['Restaurant', 'Cafe', 'Bakery', 'Store']);
  const [onlyWithoutSite, setOnlyWithoutSite] = useState(true);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(loadStatus);
  const [sheetOpen, setSheetOpen] = useState(true);

  // Inicializa o mapa
  useEffect(() => {
    let cancelled = false;
    loadMapKit()
      .then((mapkit) => {
        if (cancelled) return;
        mkRef.current = mapkit;
        const map = new mapkit.Map(mapEl.current, {
          showsCompass: mapkit.FeatureVisibility.Hidden,
          showsScale: mapkit.FeatureVisibility.Hidden,
          colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
            ? mapkit.Map.ColorSchemes.Dark
            : mapkit.Map.ColorSchemes.Light,
        });
        map.addEventListener('select', (e) => {
          if (e.annotation && e.annotation.data) setSelected(e.annotation.data);
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch((e) => setFatal(e.message || String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Redesenha os pins quando os leads (filtrados) mudam
  const shown = useMemo(
    () => (onlyWithoutSite ? leads.filter((l) => !l.hasWebsite) : leads),
    [leads, onlyWithoutSite]
  );

  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mkRef.current;
    if (!map || !mapkit) return;
    if (annRef.current.length) map.removeAnnotations(annRef.current);
    const anns = shown
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => {
        const a = new mapkit.MarkerAnnotation(
          new mapkit.Coordinate(l.lat, l.lon),
          {
            color: l.hasWebsite ? '#8E8E93' : '#34C759',
            title: l.name,
            glyphText: l.hasWebsite ? '' : '★',
          }
        );
        a.data = l;
        return a;
      });
    annRef.current = anns;
    if (anns.length) map.addAnnotations(anns);
  }, [shown]);

  const stats = useMemo(() => {
    const semSite = leads.filter((l) => !l.hasWebsite).length;
    return { total: leads.length, semSite };
  }, [leads]);

  const runSearch = useCallback(
    async (sweep) => {
      if (!query.trim() || busy) return;
      setError('');
      setBusy(true);
      setProgress(null);
      setLeads([]);
      setSelected(null);
      try {
        const mapkit = mkRef.current;
        const { region } = await geocode(mapkit, query.trim());
        mapRef.current.setRegionAnimated(region, true);

        let found;
        if (sweep) {
          found = await sweepRegion(mapkit, region, cats, {
            density: 3,
            onProgress: (done, total, count) =>
              setProgress({ done, total, count }),
          });
        } else {
          found = await searchRegion(mapkit, region, cats);
        }
        // ordena: sem site primeiro, depois por nome
        found.sort((a, b) => {
          if (a.hasWebsite !== b.hasWebsite) return a.hasWebsite ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        setLeads(found);
        setSheetOpen(true);
        if (found.length === 0) setError('Nenhum comércio encontrado nessa área.');
      } catch (e) {
        setError(e.message || 'Falha na busca.');
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [query, cats, busy]
  );

  function toggleCat(key) {
    setCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function focusLead(lead) {
    setSelected(lead);
    const map = mapRef.current;
    const mapkit = mkRef.current;
    if (map && mapkit && lead.lat != null) {
      map.setCenterAnimated(new mapkit.Coordinate(lead.lat, lead.lon), true);
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

  if (fatal) return <FatalScreen message={fatal} />;

  return (
    <div className="app">
      <div ref={mapEl} className="map" />

      {/* Barra superior translúcida */}
      <header className="chrome topbar">
        <div className="brand">
          <span className="pin">📍</span>
          <div className="brand-txt">
            <strong>Sem Site</strong>
            <small>Comércios sem site · Apple Maps</small>
          </div>
        </div>
        <form
          className="searchform"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(false);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cidade, bairro ou região…"
            aria-label="Local"
            disabled={!ready || busy}
          />
          <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
            {busy && !progress ? '…' : 'Buscar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => runSearch(true)}
            disabled={!ready || busy}
            title="Varre a área em grade para achar o máximo de comércios"
          >
            Varredura
          </button>
        </form>
      </header>

      {/* Chips de categoria */}
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

      {progress && (
        <div className="chrome progress">
          Varrendo… {progress.done}/{progress.total} · {progress.count} encontrados
        </div>
      )}
      {error && <div className="chrome toast-error">{error}</div>}
      {!ready && !fatal && <div className="chrome loading">Carregando o Apple Maps…</div>}

      {/* Painel / bottom sheet de resultados */}
      <section className={`chrome sheet ${sheetOpen ? 'open' : 'closed'}`}>
        <button className="sheet-grab" onClick={() => setSheetOpen((v) => !v)} aria-label="Alternar painel" />
        <div className="sheet-head">
          <div className="stat-row">
            <Stat value={stats.total} label="comércios" />
            <Stat value={stats.semSite} label="sem site" hot />
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={onlyWithoutSite}
              onChange={(e) => setOnlyWithoutSite(e.target.checked)}
            />
            <span>Só sem site</span>
          </label>
        </div>

        <div className="list">
          {shown.length === 0 && !busy && (
            <p className="empty">
              Busque uma cidade ou bairro para ver os comércios sem site aparecerem no mapa.
            </p>
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
        <div className="lead-sub">
          {[categoryLabel(lead.category), lead.address].filter(Boolean).join(' · ')}
        </div>
        {lead.phone && <div className="lead-phone">{lead.phone}</div>}
      </div>
      <div className="lead-actions">
        {wa && (
          <a className="act act-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
        )}
        {lead.phone && (
          <a className="act" href={'tel:' + lead.phone.replace(/[^\d+]/g, '')}>Ligar</a>
        )}
        {lead.appleMaps && (
          <a className="act" href={lead.appleMaps} target="_blank" rel="noreferrer">Mapa</a>
        )}
        <button className={`act act-status s-${status || 'novo'}`} onClick={onStatus}>
          {status === 'contatado' ? 'Contatado' : status === 'fechado' ? 'Fechado' : 'Marcar'}
        </button>
      </div>
    </article>
  );
}

function FatalScreen({ message }) {
  return (
    <div className="fatal">
      <div className="fatal-card">
        <h2>Configuração necessária</h2>
        <p>{message}</p>
        <p className="fatal-help">
          Adicione as credenciais do Apple Maps nas variáveis de ambiente do Vercel
          (<code>MAPKIT_TEAM_ID</code>, <code>MAPKIT_KEY_ID</code>,{' '}
          <code>MAPKIT_PRIVATE_KEY</code>) e recarregue. Veja o <code>README.md</code>.
        </p>
      </div>
    </div>
  );
}
