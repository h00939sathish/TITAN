import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {
  RemediationPhase,
  RemediationSeverity,
  RemediationStatus,
  RemediationTask,
} from '../types/trading';
import {
  computeRemediationStats,
  exportRoadmapMarkdown,
  filterRemediationTasks,
} from '../utils/guardEngine';
import { REPO_PATCH_FILES } from '../data/repoPatches';

interface RemediationRoadmapProps {
  tasks: RemediationTask[];
  onCycleStatus: (taskId: string) => void;
  onResetDefaults: () => void;
  onNotify: (msg: string) => void;
}

const PHASE_META: Record<
  RemediationPhase,
  { label: string; subtitle: string }
> = {
  P0: {
    label: 'Phase 0 · Emergency Fail-Closed',
    subtitle: 'Stop holiday execution, synthetic ramps, and unguarded mutations',
  },
  P1: {
    label: 'Phase 1 · Sleeve Integrity & Pricing',
    subtitle: 'Fix 4h crypto bars, live options chain, INR budget & P&L math',
  },
  P2: {
    label: 'Phase 2 · Single Path & Cleanup',
    subtitle: 'Consolidate split-brain core and archive 90+ legacy scripts',
  },
  P3: {
    label: 'Phase 3 · Paper Qualification',
    subtitle: '60-day cost-attributed gate, startup reconciliation & alerts',
  },
};

export function RemediationRoadmap({
  tasks,
  onCycleStatus,
  onResetDefaults,
  onNotify,
}: RemediationRoadmapProps) {
  const [activeTab, setActiveTab] = useState<'checklist' | 'patches'>('checklist');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | RemediationPhase>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | RemediationSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RemediationStatus>('ALL');
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'REM-003': true,
    'REM-006': true,
  });
  const [copied, setCopied] = useState(false);
  const [copiedPatchId, setCopiedPatchId] = useState<string | null>(null);

  const stats = useMemo(() => computeRemediationStats(tasks), [tasks]);
  const visibleTasks = useMemo(
    () =>
      filterRemediationTasks(
        tasks,
        phaseFilter,
        severityFilter,
        statusFilter,
        query
      ),
    [tasks, phaseFilter, severityFilter, statusFilter, query]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyMarkdown = async () => {
    const md = exportRoadmapMarkdown(tasks);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Fallback copy if clipboard permission restricted
    }
    setCopied(true);
    onNotify('Copied Project-TITAN Remediation Checklist as Markdown.');
    window.setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyPatch = async (patchId: string, filename: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Ignore clipboard restriction
    }
    setCopiedPatchId(patchId);
    onNotify(`Copied ${filename} to clipboard.`);
    window.setTimeout(() => setCopiedPatchId(null), 2500);
  };

  const statusLabel = (status: RemediationStatus) => {
    if (status === 'verified') return 'Verified';
    if (status === 'in_progress') return 'In Progress';
    return 'Pending';
  };

  const statusClass = (status: RemediationStatus) => {
    if (status === 'verified') {
      return 'border-emerald-500/35 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20';
    }
    if (status === 'in_progress') {
      return 'border-blue-500/35 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20';
    }
    return 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-[#2A3446] dark:bg-[#131924] dark:text-slate-300 dark:hover:bg-[#1B2434]';
  };

  return (
    <div className="space-y-4">
      {/* Top Progress Summary Strip */}
      <section
        aria-label="Remediation Progress Overview"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Project-TITAN Audit Remediation Plan
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              14 audit-grounded fixes across fail-closed safety, 4-sleeve integrity, single-path consolidation, and qualification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copied ? 'Copied Markdown' : 'Copy Markdown'}</span>
            </button>

            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2232] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Metrics & Progress Bar */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-[#19212E]">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Verified Complete
            </p>
            <p
              data-testid="roadmap-completion"
              className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5"
            >
              {stats.verified}/{stats.total} ({stats.completionPct}%)
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              In Progress
            </p>
            <p className="font-mono tabular-nums text-lg font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
              {stats.inProgress}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pending Backlog
            </p>
            <p className="font-mono tabular-nums text-lg font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {stats.pending}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Open Criticals
            </p>
            <p
              className={`font-mono tabular-nums text-lg font-semibold mt-0.5 ${
                stats.criticalOpen > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {stats.criticalOpen}
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#1E2633] overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${stats.completionPct}%` }}
          />
        </div>

        {/* Sub-view switcher: Audit Checklist vs. 24/7 Cloud Runner & Repo Patches */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#19212E] flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Remediation workspace views"
            className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'checklist'}
              onClick={() => setActiveTab('checklist')}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'checklist'
                  ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Audit Checklist ({tasks.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'patches'}
              onClick={() => setActiveTab('patches')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'patches'
                  ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>24/7 Runner &amp; Python Patches ({REPO_PATCH_FILES.length})</span>
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'patches' ? (
        <section
          aria-label="24/7 Cloud Scheduler and Python Fail-Closed Patches"
          className="space-y-4"
        >
          {REPO_PATCH_FILES.map((patch) => {
            const isCopied = copiedPatchId === patch.id;
            return (
              <article
                key={patch.id}
                className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {patch.filename}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {patch.sleeveTag}
                      </span>
                    </div>
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {patch.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {patch.summary}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopyPatch(patch.id, patch.filename, patch.code)}
                    aria-label={`Copy ${patch.filename}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A2232] transition-colors whitespace-nowrap shrink-0"
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{isCopied ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>

                <pre className="overflow-x-auto bg-slate-50 dark:bg-[#0B0E14] px-4 py-3 text-[11.5px] leading-relaxed font-mono text-slate-800 dark:text-slate-200">
                  <code>{patch.code}</code>
                </pre>
              </article>
            );
          })}
        </section>
      ) : (
      /* Filter Toolbar + Task Matrix */
      <section
        aria-label="Remediation Tasks Checklist"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
          {/* Phase segmented filter */}
          <div
            role="group"
            aria-label="Filter by phase"
            className="inline-flex flex-wrap items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
          >
            {(['ALL', 'P0', 'P1', 'P2', 'P3'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPhaseFilter(p)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  phaseFilter === p
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {p === 'ALL' ? 'All Phases' : p}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks..."
                aria-label="Search remediation tasks"
                className="w-40 rounded-md border border-slate-200 dark:border-[#242E40] bg-slate-50 dark:bg-[#0D1119] pl-8 pr-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Severity filter */}
            <div
              role="group"
              aria-label="Filter by severity"
              className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
            >
              {(['ALL', 'Critical', 'High', 'Medium'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    severityFilter === sev
                      ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {sev === 'ALL' ? 'All Sev' : sev}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | RemediationStatus)
              }
              className="rounded-md border border-slate-200 dark:border-[#242E40] bg-slate-50 dark:bg-[#0D1119] px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="verified">Verified</option>
            </select>
          </div>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No remediation items match your filters
            </p>
            <button
              type="button"
              onClick={() => {
                setPhaseFilter('ALL');
                setSeverityFilter('ALL');
                setStatusFilter('ALL');
                setQuery('');
              }}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#182030]"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#19212E]">
            {visibleTasks.map((task) => {
              const isOpen = Boolean(expandedIds[task.id]);
              return (
                <div
                  key={task.id}
                  className="px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-[#151C28]/70 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(task.id)}
                      aria-expanded={isOpen}
                      className="flex items-start gap-2.5 text-left min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {isOpen ? (
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-slate-400 mt-0.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-slate-400 mt-0.5"
                          aria-hidden="true"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {task.phase}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {task.id}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`font-semibold ${
                              task.severity === 'Critical'
                                ? 'text-red-600 dark:text-red-400'
                                : task.severity === 'High'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {task.severity}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {task.subsystem}
                          </span>
                        </div>

                        <p
                          className={`text-[13px] font-semibold mt-0.5 ${
                            task.status === 'verified'
                              ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-400/60'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => onCycleStatus(task.id)}
                        aria-label={`Change status of ${task.id} (currently ${statusLabel(task.status)})`}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${statusClass(task.status)}`}
                      >
                        {statusLabel(task.status)}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 ml-6.5 grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-[#1E2633] text-xs">
                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Audit Finding ({PHASE_META[task.phase].label})
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {task.rootCause}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Remediation Action
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {task.actionPlan}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Acceptance Verification
                        </p>
                        <p className="text-emerald-700 dark:text-emerald-400 leading-relaxed">
                          {task.acceptanceTest}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
