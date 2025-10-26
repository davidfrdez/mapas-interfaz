import React from 'react';
import GeoBogota from './components/GeoBogota';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <header>
        <h1>GeoBogotá</h1>
        <p>
          Busca direcciones dentro de Bogotá, revisa sugerencias en tiempo real y obtén con
          precisión las coordenadas geográficas.
        </p>
      </header>

      <GeoBogota />

      <footer>
        Construido con React, TypeScript y datos de geocodificación pública.
      </footer>
    </div>
  );
};

export default App;
