import React from 'react';

// Navegação entre "Mapa" e "Funil" + sair. Usada nas duas telas.
export function TopNav({ tab, setTab, email, onLogout, savedCount }) {
  return (
    <div className="nav">
      <div className="seg">
        <button className={tab === 'mapa' ? 'on' : ''} onClick={() => setTab('mapa')}>Mapa</button>
        <button className={tab === 'funil' ? 'on' : ''} onClick={() => setTab('funil')}>
          Funil{savedCount ? ` (${savedCount})` : ''}
        </button>
      </div>
      <button className="nav-out" onClick={onLogout} title={email || 'Sair'}>Sair</button>
    </div>
  );
}
