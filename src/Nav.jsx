import React from 'react';

// Navegação entre "Mapa" e "Funil" + sair. Usada nas duas telas.
export function TopNav({ tab, setTab, email, onLogout, savedCount, isAdmin }) {
  return (
    <div className="nav">
      <div className="seg">
        <button className={tab === 'mapa' ? 'on' : ''} onClick={() => setTab('mapa')}>Mapa</button>
        <button className={tab === 'funil' ? 'on' : ''} onClick={() => setTab('funil')}>
          Funil{savedCount ? ` (${savedCount})` : ''}
        </button>
      </div>
      <div className="nav-right">
        {isAdmin && <span className="owner-badge" title={email}>👑 Dono</span>}
        <button className="nav-out" onClick={onLogout} title={email || 'Sair'}>Sair</button>
      </div>
    </div>
  );
}
