import React, { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import Auth from './Auth.jsx';
import MapView from './MapView.jsx';
import FunnelView from './FunnelView.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [tab, setTab] = useState('mapa'); // mapa | funil

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="boot">Carregando…</div>;
  if (!session) return <Auth />;

  const email = session.user?.email;
  const onLogout = () => supabase.auth.signOut();
  const props = { tab, setTab, email, onLogout };

  return tab === 'funil' ? <FunnelView {...props} /> : <MapView {...props} />;
}
