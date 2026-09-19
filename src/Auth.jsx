import React, { useState } from 'react';
import { supabase } from './supabase.js';

export default function Auth() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!email || !password) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange no App cuida do resto
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // conta é auto-confirmada no banco; entra direto
        if (!data.session) {
          const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
          if (e2) {
            setMsg('Conta criada! Agora toque em "Entrar" com o mesmo e-mail e senha.');
            setMode('login');
          }
        }
      }
    } catch (e2) {
      setErr(traduz(e2.message || String(e2)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card chrome">
        <div className="auth-brand">
          <span className="pin">📍</span>
          <h1>Sem Site</h1>
          <p>Prospecção + funil de vendas</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Entrar</button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Criar conta</button>
        </div>

        <form onSubmit={submit}>
          <input
            type="email" inputMode="email" autoComplete="email"
            placeholder="seu@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="senha (mín. 6 caracteres)" value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        {msg && <div className="auth-msg">{msg}</div>}
        {err && <div className="auth-err">{err}</div>}
      </div>
    </div>
  );
}

function traduz(m) {
  const s = String(m).toLowerCase();
  if (s.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (s.includes('already registered') || s.includes('already been registered'))
    return 'Esse e-mail já tem conta. Use "Entrar".';
  if (s.includes('password') && s.includes('6')) return 'A senha precisa ter ao menos 6 caracteres.';
  if (s.includes('email') && s.includes('confirm')) return 'Confirme seu e-mail antes de entrar.';
  return m;
}
