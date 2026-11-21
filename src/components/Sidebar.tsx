import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarCheck,
  ClipboardCheck,
  Cloud,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import type {
  CloudSyncStatus,
  ConnectionMode,
  NavSection,
  VenueRoute,
} from '../types/trading';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  holdingsCount: number;
  workingOrdersCount: number;
  armedSleevesCount: number;
  totalSleevesCount: number;
  roadmapVerifiedCount: number;
  roadmapTotalCount: number;
  qualificationDaysCount: number;
  cloudSyncStatus: CloudSyncStatus;
  userDisplayName: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  connectionMode: ConnectionMode;
  brokerAccount: {
    broker: string;
    accountId: string;
    route: VenueRoute;
    gateway: string;
  };
  latencyMs: number;
  darkMode: boolean;
  onToggleTheme: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'execution', label: 'Execution Blotter', icon: Activity },
  { id: 'holdings', label: 'Active Holdings', icon: Briefcase },
  { id: 'tournament', label: 'Alpha Tournament', icon: Layers },
  { id: 'alpha', label: 'Strategy Alpha', icon: Trophy },
  { id: 'qualification', label: '60-Day Qualification', icon: CalendarCheck },
  { id: 'roadmap', label: 'Remediation Plan', icon: ClipboardCheck },
  { id: 'logs', label: 'Engine Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  holdingsCount,
  workingOrdersCount,
  armedSleevesCount,
  totalSleevesCount,
  roadmapVerifiedCount,
  roadmapTotalCount,
  qualificationDaysCount,
  cloudSyncStatus,
  userDisplayName,
  onSignIn,
  onSignOut,
  connectionMode,
  brokerAccount,
  latencyMs,
  darkMode,
  onToggleTheme,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const getCountHint = (id: NavSection): string | null => {
    if (id === 'holdings') return String(holdingsCount);
    if (id === 'execution') return String(workingOrdersCount);
    if (id === 'tournament') return `${armedSleevesCount}/${totalSleevesCount}`;
    if (id === 'qualification') return `${qualificationDaysCount}/60`;
    if (id === 'roadmap') return `${roadmapVerifiedCount}/${roadmapTotalCount}`;
    return null;
  };

  const modeLabel =
    connectionMode === 'alpaca_paper'
      ? 'Alpaca Live Proxy'
      : connectionMode === 'degraded'
        ? 'Degraded (Halted)'
        : 'Local Paper Fallback';

  const modeColor =
    connectionMode === 'alpaca_paper'
      ? 'text-emerald-600 dark:text-emerald-400'
      : connectionMode === 'degraded'
        ? 'text-red-600 dark:text-red-400'
        : 'text-amber-600 dark:text-amber-400';

  const navContent = (
    <div className="flex h-full flex-col bg-white dark:bg-[#0E121A] border-r border-slate-200 dark:border-[#1E2633]">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200 dark:border-[#1E2633]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="font-display text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Titan Quant
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#161D2A] dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Modules */}
      <nav aria-label="Institutional modules" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2.5 pb-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const hint = getCountHint(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSection(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isActive
                      ? 'bg-slate-100 text-slate-950 dark:bg-[#171F2E] dark:text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#131924] dark:hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {hint !== null && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 ml-2">
                      {hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Account & Theme Footer */}
      <div className="border-t border-slate-200 dark:border-[#1E2633] px-4 py-3.5 space-y-3">
        <div className="space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-500">Proxy</span>
            <span className={`font-medium truncate ${modeColor}`}>
              {modeLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-500">Account</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {brokerAccount.accountId}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-500">Route</span>
            <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
              {brokerAccount.route}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-500">Gateway</span>
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {brokerAccount.gateway} · {latencyMs}ms
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/80 dark:border-[#1E2633] space-y-1">
          {cloudSyncStatus === 'synced' || cloudSyncStatus === 'syncing' ? (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out of Firebase Cloud Sync"
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 hover:bg-slate-100 dark:text-emerald-400 dark:hover:bg-[#161D2A] transition-colors"
            >
              <span className="flex items-center gap-2 truncate">
                <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {cloudSyncStatus === 'syncing'
                    ? 'Syncing Cloud...'
                    : userDisplayName || 'Cloud Synced'}
                </span>
              </span>
              <LogOut className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              aria-label="Sign in with Google for Firebase Cloud Sync"
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-[#161D2A] transition-colors"
            >
              <span className="flex items-center gap-2 truncate">
                <LogIn className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Google Cloud Sync</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#161D2A] dark:hover:text-slate-200 transition-colors"
          >
            <span>{darkMode ? 'Obsidian Dark' : 'Daylight Paper'}</span>
            {darkMode ? (
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed rail */}
      <aside className="hidden lg:block w-60 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full shadow-2xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
