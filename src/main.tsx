import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { PinGate } from './components/PinGate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PinGate>
      <App />
    </PinGate>
  </StrictMode>
);
