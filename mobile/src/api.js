import { API_BASE } from './config';

async function req(path, options) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }
  return res.json();
}

export const api = {
  stats: () => req('/api/stats'),
  startSearch: (query) =>
    req('/api/search', { method: 'POST', body: JSON.stringify({ query }) }),
  getJob: (id) => req('/api/jobs/' + id),
  listLeads: (filters = {}) => {
    const p = new URLSearchParams();
    if (filters.onlyWithoutSite) p.set('onlyWithoutSite', '1');
    if (filters.status && filters.status !== 'todos') p.set('status', filters.status);
    if (filters.q) p.set('q', filters.q);
    return req('/api/leads?' + p.toString());
  },
  updateLead: (id, fields) =>
    req('/api/leads/' + id, { method: 'PATCH', body: JSON.stringify(fields) }),
};

export function whatsappLink(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (!digits.startsWith('55')) digits = '55' + digits;
  return `https://wa.me/${digits}`;
}

export const STATUS = [
  { value: 'novo', label: 'Novo', color: '#64748b' },
  { value: 'contatado', label: 'Contatado', color: '#0ea5e9' },
  { value: 'negociando', label: 'Negociando', color: '#f59e0b' },
  { value: 'fechado', label: 'Fechado', color: '#16a34a' },
  { value: 'descartado', label: 'Descartado', color: '#ef4444' },
];
