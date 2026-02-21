import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatInterface from './components/ChatInterface';

// Listen for close message from parent
window.addEventListener('message', (event) => {
  if (event.data.type === 'SOFIA_CLOSE') {
    window.parent.postMessage({ type: 'SOFIA_CLOSED' }, '*');
  }
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ChatInterface />
  </React.StrictMode>
);
