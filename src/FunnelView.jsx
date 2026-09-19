import React, { useEffect, useMemo, useState } from 'react';
import { listLeads, updateLead, deleteLead, STAGES, stageMeta } from './crm.js';
import { TopNav } from './Nav.jsx';

const brl = (v) =>
  v == null || v === ''
    ? ''
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FunnelView({ tab, setTab, email, onLogout, isAdmin }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState('todos');

  useEffect(() => {
    listLeads()
      .then((rows) => setLeads(rows))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => (stageFilter === 'todos' ? leads : leads.filter((l) => l.stage === stageFilter)),
    [leads, stageFilter]
  );

  const resumo = useMemo(() => {
    const fechados = leads.filter((l) => l.stage === 'fechado');
    const total = fechados.reduce((s, l) => s + (Number(l.deal_value) || 0), 0);
    return { total: leads.length, fechados: fechados.length, receita: total };
  }, [leads]);

  async function patch(id, fields) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...fields } : l)));
    try {
      await updateLead(id, fields);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLead(id);
    } catch (e) {
      setError(e.message);
    }
  }

  const countBy = (key) => leads.filter((l) => l.stage === key).length;

  return (
    <div className="funnel">
      <header className="chrome funnel-top">
        <TopNav tab={tab} setTab={setTab} email={email} onLogout={onLogout} savedCount={leads.length} isAdmin={isAdmin} />
      </header>

      <div className="funnel-body">
        <div className="resumo">
          <Stat value={resumo.total} label="leads" />
          <Stat value={resumo.fechados} label="fechados" ok />
          <Stat value={brl(resumo.receita) || 'R$ 0'} label="receita fechada" ok wide />
        </div>

        <div className="stage-chips">
          <button className={stageFilter === 'todos' ? 'on' : ''} onClick={() => setStageFilter('todos')}>
            Todos ({leads.length})
          </button>
          {STAGES.map((s) => (
            <button
              key={s.key}
              className={stageFilter === s.key ? 'on' : ''}
              style={stageFilter === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : {}}
              onClick={() => setStageFilter(s.key)}
            >
              {s.label} ({countBy(s.key)})
            </button>
          ))}
        </div>

        {error && <div className="toast-error inline">{error}</div>}
        {loading && <p className="empty">Carregando seus leads…</p>}
        {!loading && shown.length === 0 && (
          <p className="empty">
            Nenhum lead {stageFilter !== 'todos' ? 'nessa etapa' : 'salvo ainda'}. Vá na aba{' '}
            <b>Mapa</b>, busque comércios e toque em <b>+ Salvar</b>.
          </p>
        )}

        <div className="funnel-list">
          {shown.map((l) => (
            <FunnelCard key={l.id} lead={l} onPatch={patch} onRemove={remove} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, ok, wide }) {
  return (
    <div className={`stat ${ok ? 'stat-ok' : ''} ${wide ? 'stat-wide' : ''}`}>
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

function FunnelCard({ lead, onPatch, onRemove }) {
  const [f, setF] = useState({
    contact_date: lead.contact_date || '',
    return_date: lead.return_date || '',
    quote_value: lead.quote_value ?? '',
    deal_value: lead.deal_value ?? '',
    service: lead.service || '',
    notes: lead.notes || '',
    phone: lead.phone || '',
  });
  const meta = stageMeta(lead.stage);
  const wa = waLink(f.phone);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const blur = (k) => {
    const val = f[k];
    const orig = lead[k] ?? '';
    if (String(val) !== String(orig)) onPatch(lead.id, { [k]: val });
  };

  return (
    <article className="fcard" style={{ borderLeftColor: meta.color }}>
      <div className="fcard-head">
        <div>
          <h3>{lead.name}</h3>
          <div className="fcard-sub">
            {[lead.category, lead.address].filter(Boolean).join(' · ')}
            {!lead.has_website && <span className="tag mini">SEM SITE</span>}
          </div>
        </div>
        <select
          className="stage-sel"
          value={lead.stage}
          onChange={(e) => onPatch(lead.id, { stage: e.target.value })}
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div className="fgrid">
        <Field label="Telefone">
          <input value={f.phone} onChange={(e) => set('phone', e.target.value)} onBlur={() => blur('phone')} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="Serviço orçado">
          <input value={f.service} onChange={(e) => set('service', e.target.value)} onBlur={() => blur('service')} placeholder="Site, tráfego…" />
        </Field>
        <Field label="Data do contato">
          <input type="date" value={f.contact_date} onChange={(e) => set('contact_date', e.target.value)} onBlur={() => blur('contact_date')} />
        </Field>
        <Field label="Retorno em">
          <input type="date" value={f.return_date} onChange={(e) => set('return_date', e.target.value)} onBlur={() => blur('return_date')} />
        </Field>
        <Field label="Valor orçado (R$)">
          <input type="number" inputMode="decimal" value={f.quote_value} onChange={(e) => set('quote_value', e.target.value)} onBlur={() => blur('quote_value')} placeholder="0,00" />
        </Field>
        <Field label="Valor fechado (R$)">
          <input type="number" inputMode="decimal" value={f.deal_value} onChange={(e) => set('deal_value', e.target.value)} onBlur={() => blur('deal_value')} placeholder="0,00" />
        </Field>
      </div>

      <Field label="Observações" full>
        <textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} onBlur={() => blur('notes')} placeholder="Anotações da conversa…" />
      </Field>

      <div className="fcard-actions">
        {wa && <a className="act act-wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
        {f.phone && <a className="act" href={'tel:' + f.phone.replace(/[^\d+]/g, '')}>Ligar</a>}
        {lead.map_url && <a className="act" href={lead.map_url} target="_blank" rel="noreferrer">Mapa</a>}
        <button className="act act-del" onClick={() => confirmDelete(lead, onRemove)}>Excluir</button>
      </div>
    </article>
  );
}

function confirmDelete(lead, onRemove) {
  if (confirm(`Excluir "${lead.name}" do funil?`)) onRemove(lead.id);
}

function Field({ label, children, full }) {
  return (
    <label className={`field ${full ? 'field-full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
