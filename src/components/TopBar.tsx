import { Menu, OctagonAlert, Pause, Play, Plus } from 'lucide-react';
import type { ConnectionMode, NavSection } from '../types/trading';

interface TopBarProps {
  activeSection: NavSection;
  approvalsPaused: boolean;
  killSwitchEngaged: boolean;
  connectionMode: ConnectionMode;
  onTogglePauseApprovals: () => void;
  onOpenKillSwitch: () => void;
  onOpenNewOrder: () => void;
  onOpenMobileMenu: () => void;
}

const SECTION_LABELS: Record<NavSection, string> = {
  overview: 'Overview Dashboard',
  engine: 'Auto Trading Loop',
  execution: 'Execution Blotter',
  holdings: 'Active Holdings',
  tournament: 'Alpha Tournament',
  alpha: 'Strategy Alpha',
  roadmap: 'Remediation Plan',
  qualification: '60-Day Qualification',
  logs: 'Engine Logs',
  settings: 'Settings',
};

export function TopBar({
  activeSection,
  approvalsPaused,
  killSwitchEngaged,
  connectionMode,
  onTogglePauseApprovals,
  onOpenKillSwitch,
  onOpenNewOrder,
  onOpenMobileMenu,
}: TopBarProps) {
  const modeText =
    connectionMode === 'alpaca_paper'
      ? 'Alpaca Paper Proxy'
      : connectionMode === 'degraded'
        ? 'Degraded · Fail-Closed'
        : 'Local Paper Fallback';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 dark:border-[#1E2633] bg-white/95 dark:bg-[#0B0E14]/95 backdrop-blur-sm px-4 lg:px-6">
      {/* Left: Mobile drawer trigger + contextual breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#161D2A]"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {modeText}
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {SECTION_LABELS[activeSection]}
          </h1>
          {approvalsPaused && !killSwitchEngaged && (
            <span className="hidden md:inline text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap ml-2">
              · Approvals paused
            </span>
          )}
          {killSwitchEngaged && (
            <span className="hidden md:inline text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap ml-2">
              · Trading halted
            </span>
          )}
        </div>
      </div>

      {/* Right: Operational controls (single-line, high-contrast) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenNewOrder}
          disabled={killSwitchEngaged}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New Order</span>
          <span className="sm:hidden">Order</span>
        </button>

        <button
          type="button"
          onClick={onTogglePauseApprovals}
          disabled={killSwitchEngaged}
          aria-label={approvalsPaused ? 'Resume Approvals' : 'Pause Approvals'}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            approvalsPaused
              ? 'border-amber-500/50 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#2A3446] dark:bg-[#131924] dark:text-slate-200 dark:hover:bg-[#1A2232]'
          }`}
        >
          {approvalsPaused ? (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Resume Approvals</span>
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Pause Approvals</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenKillSwitch}
          aria-label={killSwitchEngaged ? 'Reset Trading Halt' : 'Engage Kill Switch'}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <OctagonAlert className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">
            {killSwitchEngaged ? 'Reset Halt' : 'Kill Switch'}
          </span>
          <span className="sm:hidden">{killSwitchEngaged ? 'Reset' : 'Kill'}</span>
        </button>
      </div>
    </header>
  );
}
