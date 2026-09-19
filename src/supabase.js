import { createClient } from '@supabase/supabase-js';

// URL e chave PUBLISHABLE do projeto Supabase "sem-site".
// São feitas para uso no navegador; os dados ficam protegidos por RLS
// (cada usuário só enxerga os próprios leads). Podem ser sobrescritas por
// variáveis de ambiente no Vercel, se um dia você quiser trocar de projeto.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://kdbmtbkmyrsvkevumifw.supabase.co';
const KEY =
  import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_ju8UNpoL8-PVK3-Vn9RBdQ__7RAHBzn';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
