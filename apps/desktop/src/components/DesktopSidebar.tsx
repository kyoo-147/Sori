import React from 'react';
import { ActiveScreen, AppSettings } from '../types';
import { Activity, BookOpen, Clock, Cpu, Home, PlayCircle, Puzzle, Search, Settings, Shield, Sparkles, Zap } from 'lucide-react';

interface DesktopSidebarProps { activeScreen: ActiveScreen; setActiveScreen: (screen: ActiveScreen) => void; settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>>; openSettingsModal: () => void; isOpen?: boolean; onClose?: () => void; collapsed?: boolean; }
type NavItem = { id: ActiveScreen; label: string; icon: React.ReactNode };

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ activeScreen, setActiveScreen, openSettingsModal, isOpen = true, onClose, collapsed = false }) => {
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState('');
  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Workspace', items: [{ id: 'home', label: 'Home', icon: <Home /> }, { id: 'transcripts', label: 'Transcripts', icon: <Clock /> }, { id: 'vocabulary', label: 'Vocabulary', icon: <BookOpen /> }, { id: 'voice-edit', label: 'Voice Edit', icon: <Sparkles /> }] },
    { label: 'Engine', items: [{ id: 'models', label: 'Models & Routing', icon: <Cpu /> }, { id: 'benchmarks', label: 'Benchmarks', icon: <Zap /> }] },
    { label: 'Extensions', items: [{ id: 'extensions', label: 'Extensions', icon: <Puzzle /> }] },
    { label: 'System', items: [{ id: 'privacy', label: 'Privacy', icon: <Shield /> }, { id: 'diagnostics', label: 'Diagnostics', icon: <Activity /> }] },
  ];
  const searchItems = groups.flatMap((group) => group.items).concat({ id: 'settings', label: 'Settings', icon: <Settings /> });
  React.useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, []);
  const navigate = (screen: ActiveScreen) => { setActiveScreen(screen); setSearch(''); onClose?.(); };
  const itemButton = (item: NavItem) => { const active = activeScreen === item.id; return <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-label={item.label} aria-current={active ? 'page' : undefined} className="sori-sidebar-item"><span className="sori-sidebar-item__icon">{item.icon}</span><span className="truncate">{item.label}</span></button>; };
  return <aside className={`${isOpen && !collapsed ? 'flex' : 'hidden'} sori-shell__sidebar md:flex max-md:fixed max-md:top-10 max-md:inset-y-0 max-md:left-0 max-md:z-40`} data-open={isOpen && !collapsed} data-collapsed={collapsed}>
    <div className="sori-sidebar-brand" aria-label="Sori voice workspace"><span className="sori-sidebar-brand__mark" aria-hidden="true">⌁</span><span><strong>Sori</strong><small>Voice workspace</small></span></div>
    <div className="sori-shell__sidebar-nav" role="navigation" aria-label="Primary Sori navigation">
      <div className="sori-sidebar-search-wrap"><Search /><input ref={searchRef} type="search" aria-label="Search Sori" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace" className="sori-focus-ring" /><kbd>⌘ K</kbd>{search.trim() && <div role="listbox" aria-label="Search results" className="sori-sidebar-search-results">{searchItems.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase())).map((item) => <button type="button" role="option" key={item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}{!searchItems.some((item) => item.label.toLowerCase().includes(search.trim().toLowerCase())) && <span>No matching destinations</span>}</div>}</div>
      {groups.map((group) => <section className="sori-sidebar-section" key={group.label}><h2>{group.label}</h2>{group.items.map(itemButton)}</section>)}
      <section className="sori-sidebar-section"><h2>Setup</h2>{itemButton({ id: 'onboarding', label: 'First-run setup', icon: <PlayCircle /> })}</section>
    </div>
    <div className="sori-shell__sidebar-footer"><button type="button" onClick={() => { navigate('settings'); openSettingsModal(); }} aria-current={activeScreen === 'settings' ? 'page' : undefined} className="sori-sidebar-item"><span className="sori-sidebar-item__icon"><Settings /></span><span>Settings</span></button><div className="sori-sidebar-account"><span className="sori-sidebar-avatar">A</span><span><strong>Alex Chen</strong><small>Local workspace</small></span></div></div>
  </aside>;
};
