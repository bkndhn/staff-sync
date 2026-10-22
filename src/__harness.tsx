import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import FlexShiftBroadcast from './components/FlexShiftBroadcast';
createRoot(document.getElementById('root')!).render(
  <div className="p-3 bg-emerald-700 min-h-screen"><FlexShiftBroadcast locations={['Godown', 'Pant Godown', 'Orion Main']} defaultLocation="Godown" /></div>
);
