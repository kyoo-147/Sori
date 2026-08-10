import { useEffect, useState } from 'react';
import { createTransport, type DaemonInfo } from './transport';

export default function App() {
  const [daemon, setDaemon] = useState<DaemonInfo | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => { void createTransport().getInfo().then(setDaemon); }, []);

  return <div className="shell">
    <header className="titlebar"><strong>Sori</strong><span>Desktop Studio</span><span className="spacer" /><span className="status"><i className={daemon?.status === 'connected' ? 'online' : ''} />{daemon?.status ?? 'starting'}</span></header>
    <div className="body">
      <nav><div className="brand">SORI</div><button className="selected">Overview</button><button>History</button><button>Models</button><button>Settings</button><div className="nav-bottom">Windows first · local-first</div></nav>
      <main><p className="eyebrow">WORKSPACE</p><h1>Ready when you are.</h1><p className="muted">The desktop shell is connected through a transport boundary. It can run safely with mock data while the local daemon is unavailable.</p>
        <section className="card hero"><div><p className="eyebrow">DICTATION</p><h2>{listening ? 'Listening…' : 'Start a local session'}</h2><p className="muted">Hold your shortcut or use the control below. Audio stays on this device.</p></div><button className="primary" onClick={() => setListening(value => !value)}>{listening ? 'Stop listening' : 'Start listening'}</button></section>
        <section className="grid"><div className="card"><p className="eyebrow">DAEMON</p><h3>{daemon?.status === 'connected' ? 'Connected' : 'Mock transport'}</h3><p className="muted">{daemon?.endpoint ?? 'Checking status…'}</p></div><div className="card"><p className="eyebrow">NEXT</p><h3>Configure your hotkey</h3><p className="muted">Native permissions and daemon IPC are enabled by the platform shell.</p></div></section>
      </main>
    </div>
  </div>;
}
