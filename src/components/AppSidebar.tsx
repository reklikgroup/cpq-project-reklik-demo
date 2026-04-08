import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Calculator, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Quote Builder', icon: Calculator },
  { to: '/catalog', label: 'Catalog Viewer', icon: BookOpen },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
        {!collapsed && (
          <div>
            <h1 className="text-base font-bold text-sidebar-primary-foreground">QuoteBuilder</h1>
            <p className="text-xs text-sidebar-foreground/60">CPQ Tool</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 space-y-1 px-2">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
