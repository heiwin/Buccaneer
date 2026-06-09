import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, Settings, HardDrive, Heart } from 'lucide-react';
import appIcon from '../assets/icon.png';

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

      <div className="px-4 lg:px-6">
        <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
      </div>
    </aside>
  );
}
