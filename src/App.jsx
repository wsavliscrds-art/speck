import React, { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { getMyRole } from './crm.js';
import Auth from './Auth.jsx';
import MapView from './MapView.jsx';
import FunnelView from './FunnelView.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [tab, setTab] = useState('mapa'); // mapa | funil
  const [role, setRole] = useState('user');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) getMyRole().then(setRole).catch(() => setRole('user'));
  }, [session]);

  if (session === undefined) return <div className="boot">Carregando…</div>;
  if (!session) return <Auth />;

  const email = session.user?.email;
  const onLogout = () => supabase.auth.signOut();
  const props = { tab, setTab, email, onLogout, isAdmin: role === 'admin' };

  return tab === 'funil' ? <FunnelView {...props} /> : <MapView {...props} />;
}
