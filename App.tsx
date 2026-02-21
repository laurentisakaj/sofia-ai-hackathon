
import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminPanel from './components/AdminPanel';
import ArrivalDashboard from './components/ArrivalDashboard';

const App: React.FC = () => {
  const [view, setView] = useState<'chat' | 'admin' | 'arrival'>('chat');
  const [bookingCode, setBookingCode] = useState('');

  useEffect(() => {
    // Simple client-side routing
    const path = window.location.pathname;
    if (path === '/admin' || path === '/admin/' || path === '/reset-password' || path === '/reset-password/') {
      setView('admin');
    }
    const arrivalMatch = path.match(/^\/arrival\/(.+?)\/?\s*$/);
    if (arrivalMatch) {
      setBookingCode(decodeURIComponent(arrivalMatch[1]));
      setView('arrival');
    }
  }, []);

  return (
    <div className={`fixed inset-0 w-full h-full ${view === 'arrival' ? 'overflow-y-auto' : 'overflow-hidden'} bg-white`}>
      {view === 'chat' ? (
        <ChatInterface />
      ) : view === 'arrival' ? (
        <ArrivalDashboard bookingCode={bookingCode} />
      ) : (
        <AdminPanel onClose={() => {
          setView('chat');
          window.history.pushState({}, '', '/');
        }} />
      )}
    </div>
  );
};

export default App;
