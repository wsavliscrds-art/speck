import { supabase } from './supabase.js';

// Estágios do funil (ordem = fluxo).
export const STAGES = [
  { key: 'novo', label: 'Novo', color: '#8e8e93' },
  { key: 'contatado', label: 'Contatado', color: '#0a84ff' },
  { key: 'orcado', label: 'Orçado', color: '#ff9f0a' },
  { key: 'fechado', label: 'Fechado', color: '#34c759' },
  { key: 'perdido', label: 'Perdido', color: '#ff3b30' },
];

export function stageMeta(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

// Papel do usuário logado ('admin' = dono, 'user' = comum).
export async function getMyRole() {
  const { data } = await supabase.from('profiles').select('role').maybeSingle();
  return data?.role || 'user';
}

// Salva (ou atualiza) um lead vindo do mapa no funil do usuário.
export async function saveLead(lead) {
  const user_id = await uid();
  if (!user_id) throw new Error('Faça login para salvar.');
  const row = {
    user_id,
    ext_id: lead.id,
    name: lead.name,
    phone: lead.phone || null,
    address: lead.address || null,
    category: lead.category || null,
    website: lead.website || null,
    has_website: !!lead.hasWebsite,
    lat: lead.lat ?? null,
    lon: lead.lon ?? null,
    source: lead.source || null,
    map_url: lead.osm || null,
    stage: 'novo',
  };
  const { data, error } = await supabase
    .from('leads')
    .upsert(row, { onConflict: 'user_id,ext_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Conjunto de ext_id já salvos (para marcar cartões como "salvo").
export async function savedExtIds() {
  const { data, error } = await supabase.from('leads').select('ext_id');
  if (error) return new Set();
  return new Set((data || []).map((r) => r.ext_id).filter(Boolean));
}

// Lista todos os leads do funil.
export async function listLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

const EDITABLE = [
  'stage', 'contact_date', 'return_date', 'quote_value',
  'deal_value', 'service', 'notes', 'phone',
];

export async function updateLead(id, fields) {
  const patch = {};
  for (const k of EDITABLE) if (k in fields) patch[k] = fields[k] === '' ? null : fields[k];
  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
