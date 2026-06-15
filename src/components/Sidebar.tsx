import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, Settings, HardDrive, Heart, ExternalLink, CheckCircle2 } from 'lucide-react';
import appIcon from '../assets/icon.png';
import { checkForUpdate, type UpdateInfo } from '../api/updater';
import { open } from '@tauri-apps/plugin-shell';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-4 p-3 rounded-xl transition-colors duration-200 w-full border ${
          isActive
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-800/50'
        }`
      }
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="hidden lg:block font-bold text-sm tracking-wide">{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    checkForUpdate()
      .then(setUpdate)
      .catch(() => { /* silently ignore */ });
  }, []);

  return (
    <aside className="w-20 lg:w-64 border-r border-zinc-800/50 flex flex-col justify-between py-8 shrink-0">
      <div>
        {/* Logo */}
        <div className="flex items-center justify-center lg:justify-start px-4 lg:px-6 mb-12">
          <div className="pl-3 flex items-end">
            <img src={appIcon} alt="Buccaneer Icon" className="w-9 h-9 object-contain drop-shadow-lg" />
            <span className="hidden lg:block ml-3 font-black text-xl tracking-widest uppercase leading-none">
              Buccaneer
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-2 px-4 lg:px-6">
          <NavItem to="/" icon={<Home size={20} />} label="Home" />
          <NavItem to="/discover" icon={<Compass size={20} />} label="Discover" />
          <NavItem to="/search" icon={<Search size={20} />} label="Search" />
          <NavItem to="/downloads" icon={<HardDrive size={20} />} label="Downloads" />
          <NavItem to="/favorites" icon={<Heart size={20} />} label="Favorites" />
        </nav>
      </div>

      <div className="flex flex-col gap-2 px-4 lg:px-6">
        {update && (
          update.available ? (
            <button
              onClick={() => open('https://github.com/heiwin/Buccaneer/releases/latest')}
              title={`Update ${update.latestVersion} available — click to download`}
              className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <ExternalLink size={14} />
              <span className="hidden lg:inline font-semibold">Update {update.latestVersion} available</span>
              <span className="lg:hidden font-semibold">⬆</span>
            </button>
          ) : (
            <div
              title={`Buccaneer is up to date (${update.currentVersion})`}
              className="flex items-center gap-2 px-3 py-2 mb-2 text-xs rounded-xl bg-zinc-800/30 border border-zinc-700/40 text-zinc-500"
            >
              <CheckCircle2 size={14} />
              <span className="hidden lg:inline font-medium">Up to date ({update.currentVersion})</span>
              <span className="lg:hidden">✓</span>
            </div>
          )
        )}
        <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
      </div>
    </aside>
  );
}
