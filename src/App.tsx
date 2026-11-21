import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  BROKER_METADATA,
  INITIAL_AUDIT_LOGS,
  INITIAL_FILLS,
  INITIAL_HOLDINGS,
  INITIAL_PORTFOLIO_SNAPSHOT,
  INITIAL_RISK_SETTINGS,
  INITIAL_SLEEVES,
  INITIAL_STRATEGIES,
  INITIAL_WORKING_ORDERS,
} from './data/seedData';
import { INITIAL_REMEDIATION_TASKS } from './data/remediationData';
import type {
  AuditLogEntry,
  AutoEngineConfig,
  BrokerPortfolioPayload,
  CloudSyncStatus,
  ConnectionMode,
  EngineStatusPayload,
  FillRecord,
  Holding,
  HoldingSortKey,
  HoldingWithPnl,
  NavSection,
  OrderSide,
  PortfolioSnapshot,
  QualificationEntry,
  RemediationTask,
  RiskSettings,
  SideFilter,
  SortDirection,
  TimeInForce,
  TournamentSleeve,
  VenueRoute,
  WorkingOrder,
} from './types/trading';
import {
  computeHoldingPnl,
  computePortfolioMetrics,
  filterHoldings,
  formatCurrency,
  sortHoldings,
} from './utils/portfolioEngine';
import {
  computeRemediationStats,
  nextRemediationStatus,
} from './utils/guardEngine';
import { brokerApi } from './utils/apiClient';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { KpiStrip } from './components/KpiStrip';
import { HoldingsBlotter } from './components/HoldingsBlotter';
import { WorkingOrdersPanel } from './components/WorkingOrdersPanel';
import { TournamentSleeves } from './components/TournamentSleeves';
import { StrategyLeaderboard } from './components/StrategyLeaderboard';
import {
  BracketModal,
  KillSwitchModal,
  ModifyOrderModal,
  NewOrderModal,
} from './components/Modals';
import {
  EngineLogsView,
  RecentFillsTable,
  SettingsView,
  StrategyAlphaChart,
} from './components/SecondaryViews';
import { RemediationRoadmap } from './components/RemediationRoadmap';
import { QualificationLogbook } from './components/QualificationLogbook';
import { AutoTradingEngineView } from './components/AutoTradingEngineView';
import {
  computeQualificationSummary,
  INITIAL_QUALIFICATION_ENTRIES,
} from './utils/qualificationEngine';
import {
  appendCloudAuditLog,
  ensureUserWorkspace,
  removeQualificationEntry,
  saveQualificationEntry,
  saveRemediationTaskState,
  subscribeCloudAuditLogs,
  subscribeQualificationLogs,
  subscribeRemediationTasks,
} from './utils/cloudSync';

const ROADMAP_STORAGE_KEY = 'titan_quant_remediation_v1';
const QUALIFICATION_STORAGE_KEY = 'titan_quant_qualification_v1';

function loadRemediationTasks(): RemediationTask[] {
  try {
    const raw = window.localStorage.getItem(ROADMAP_STORAGE_KEY);
    if (!raw) return INITIAL_REMEDIATION_TASKS;
    const saved = JSON.parse(raw) as Record<string, RemediationTask['status']>;
    return INITIAL_REMEDIATION_TASKS.map((task) => {
      const override = saved[task.id];
      if (
        override === 'pending' ||
        override === 'in_progress' ||
        override === 'verified'
      ) {
        return { ...task, status: override };
      }
      return task;
    });
  } catch {
    return INITIAL_REMEDIATION_TASKS;
  }
}

function loadQualificationEntries(): QualificationEntry[] {
  try {
    const raw = window.localStorage.getItem(QUALIFICATION_STORAGE_KEY);
    if (!raw) return INITIAL_QUALIFICATION_ENTRIES;
    const parsed = JSON.parse(raw) as QualificationEntry[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_QUALIFICATION_ENTRIES;
  } catch {
    return INITIAL_QUALIFICATION_ENTRIES;
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [darkMode, setDarkMode] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Express backend connection & authoritative portfolio state
  const [connectionMode, setConnectionMode] =
    useState<ConnectionMode>('local_paper');
  const [brokerAccount, setBrokerAccount] = useState<{
    broker: string;
    accountId: string;
    route: VenueRoute;
    gateway: string;
  }>({
    broker: BROKER_METADATA.broker,
    accountId: BROKER_METADATA.accountId,
    route: 'SIP-DIRECT',
    gateway: BROKER_METADATA.gateway,
  });
  const [holdings, setHoldings] = useState<Holding[]>(INITIAL_HOLDINGS);
  const [workingOrders, setWorkingOrders] = useState<WorkingOrder[]>(
    INITIAL_WORKING_ORDERS
  );
  const [fills, setFills] = useState<FillRecord[]>(INITIAL_FILLS);
  const [sleeves, setSleeves] = useState<TournamentSleeve[]>(INITIAL_SLEEVES);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot>(
    INITIAL_PORTFOLIO_SNAPSHOT
  );
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(
    INITIAL_RISK_SETTINGS
  );
  const [logs, setLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [approvalsPaused, setApprovalsPaused] = useState(false);
  const [killSwitchEngaged, setKillSwitchEngaged] = useState(false);

  // Firebase Auth & Firestore Cloud Sync state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>('signed_out');
  const [cloudAuditLogs, setCloudAuditLogs] = useState<AuditLogEntry[]>([]);
  const cloudTaskIdsRef = useRef<Set<string>>(new Set());
  const cloudQualIdsRef = useRef<Set<string>>(new Set());

  // Remediation Roadmap & 60-Day Qualification persistent state
  const [remediationTasks, setRemediationTasks] = useState<RemediationTask[]>(
    () => loadRemediationTasks()
  );
  const [qualificationEntries, setQualificationEntries] = useState<
    QualificationEntry[]
  >(() => loadQualificationEntries());

  // Blotter filter & sort state
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<HoldingSortKey>('pnlDollar');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Active modals & status notice
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [killSwitchModalOpen, setKillSwitchModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkingOrder | null>(null);
  const [editingBracket, setEditingBracket] = useState<HoldingWithPnl | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatusPayload | null>(
    null
  );
  const [engineManualBusy, setEngineManualBusy] = useState(false);

  const applyServerPayload = useCallback((data: BrokerPortfolioPayload) => {
    setConnectionMode(data.connectionMode);
    setBrokerAccount(data.brokerAccount);
    setHoldings(data.holdings);
    setWorkingOrders(data.workingOrders);
    setFills(data.fills);
    setSleeves(data.sleeves);
    setSnapshot(data.snapshot);
    setRiskSettings(data.riskSettings);
    setLogs(data.logs);
    setApprovalsPaused(data.approvalsPaused);
    setKillSwitchEngaged(data.killSwitchEngaged);
  }, []);

  // Hydrate initial authoritative portfolio, fail-closed guards & auto-engine status from Express backend
  useEffect(() => {
    let active = true;
    brokerApi
      .fetchPortfolio()
      .then((data) => {
        if (active) applyServerPayload(data);
      })
      .catch(() => {
        // Keep deterministic local fallback if preview server is restarting
      });
    brokerApi
      .fetchEngineStatus()
      .then((status) => {
        if (active) setEngineStatus(status);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [applyServerPayload]);

  // Poll engine status every 15s while auto-loop is enabled or user is on the Auto Trading Loop tab
  useEffect(() => {
    const shouldPoll =
      activeSection === 'engine' || Boolean(engineStatus?.config.enabled);
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      brokerApi
        .fetchEngineStatus()
        .then((status) => setEngineStatus(status))
        .catch(() => {});
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeSection, engineStatus?.config.enabled]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      const map: Record<string, RemediationTask['status']> = {};
      for (const task of remediationTasks) {
        map[task.id] = task.status;
      }
      window.localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage quota issues
    }
  }, [remediationTasks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        QUALIFICATION_STORAGE_KEY,
        JSON.stringify(qualificationEntries)
      );
    } catch {
      // Ignore storage quota issues
    }
  }, [qualificationEntries]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudSyncStatus('signed_out');
        setCloudAuditLogs([]);
        cloudTaskIdsRef.current = new Set();
        cloudQualIdsRef.current = new Set();
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore real-time listeners strictly after auth is ready and user is authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let active = true;
    const unsubs: (() => void)[] = [];
    setCloudSyncStatus('syncing');

    const handleSyncError = (err: Error) => {
      if (!active) return;
      setCloudSyncStatus('error');
      const msg = err.message.includes('Quota exceeded')
        ? 'Firestore daily free quota reached; quota resets tomorrow.'
        : 'Cloud sync permission or connectivity notice — local workspace remains active.';
      setNotice(msg);
    };

    ensureUserWorkspace(firebaseUser)
      .then(() => {
        if (!active) return;
        unsubs.push(
          subscribeRemediationTasks(
            firebaseUser.uid,
            (cloudMap) => {
              cloudTaskIdsRef.current = new Set(Object.keys(cloudMap));
              if (Object.keys(cloudMap).length > 0) {
                setRemediationTasks((prev) =>
                  prev.map((task) =>
                    cloudMap[task.id]
                      ? { ...task, status: cloudMap[task.id].status }
                      : task
                  )
                );
              }
              setCloudSyncStatus('synced');
            },
            handleSyncError
          )
        );
        unsubs.push(
          subscribeQualificationLogs(
            firebaseUser.uid,
            (cloudEntries) => {
              cloudQualIdsRef.current = new Set(
                cloudEntries.map((e) => e.entryId)
              );
              if (cloudEntries.length > 0) {
                setQualificationEntries(cloudEntries);
              }
              setCloudSyncStatus('synced');
            },
            handleSyncError
          )
        );
        unsubs.push(
          subscribeCloudAuditLogs(
            firebaseUser.uid,
            (items) => {
              setCloudAuditLogs(items);
              setCloudSyncStatus('synced');
            },
            handleSyncError
          )
        );
      })
      .catch((err) => {
        handleSyncError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      active = false;
      for (const unsub of unsubs) unsub();
    };
  }, [authReady, firebaseUser]);

  const showNotice = (msg: string) => {
    setNotice(msg);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Derived metrics
  const metrics = useMemo(
    () => computePortfolioMetrics(holdings, snapshot, riskSettings),
    [holdings, snapshot, riskSettings]
  );

  const enrichedHoldings = useMemo(
    () => holdings.map(computeHoldingPnl),
    [holdings]
  );

  const visibleHoldings = useMemo(() => {
    const filtered = filterHoldings(enrichedHoldings, sideFilter, searchQuery);
    return sortHoldings(filtered, sortKey, sortDirection);
  }, [enrichedHoldings, sideFilter, searchQuery, sortKey, sortDirection]);

  const armedSleevesCount = useMemo(
    () =>
      killSwitchEngaged
        ? 0
        : sleeves.filter(
            (s) =>
              s.armed && (s.guardReport ? s.guardReport.canExecute : true)
          ).length,
    [sleeves, killSwitchEngaged]
  );

  const roadmapStats = useMemo(
    () => computeRemediationStats(remediationTasks),
    [remediationTasks]
  );

  const qualificationSummary = useMemo(
    () => computeQualificationSummary(qualificationEntries, 60),
    [qualificationEntries]
  );

  const mergedLogs = useMemo(() => {
    if (cloudAuditLogs.length === 0) return logs;
    const seen = new Set(logs.map((l) => l.id));
    const extra = cloudAuditLogs.filter((l) => !seen.has(l.id));
    return [...logs, ...extra].slice(0, 200);
  }, [logs, cloudAuditLogs]);

  const handleSignInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showNotice('Signed in with Google — Firestore cloud sync enabled.');
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('popup-closed')
          ? 'Google sign-in popup closed before completion.'
          : 'Unable to complete Google sign-in. Allow popups and retry.';
      showNotice(message);
    }
  };

  const handleSignOutGoogle = async () => {
    try {
      await signOut(auth);
      showNotice('Signed out of cloud sync — workspace remains available locally.');
    } catch {
      showNotice('Sign-out failed.');
    }
  };

  // Handlers backed by Express API proxy (and mirrored to Firestore audit trail when signed in)
  const runMutation = async (
    fn: () => Promise<BrokerPortfolioPayload>,
    successMsg: string
  ) => {
    try {
      const next = await fn();
      applyServerPayload(next);
      showNotice(successMsg);
      if (firebaseUser && next.logs.length > 0) {
        void appendCloudAuditLog(firebaseUser.uid, next.logs[0]).catch(() => {
          // Structured error logged inside handleFirestoreError
        });
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleToggleSort = (key: HoldingSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const handleRefreshMarks = () => {
    void runMutation(
      () => brokerApi.refreshMarks(),
      connectionMode === 'alpaca_paper'
        ? 'Synchronized live telemetry from Alpaca Paper proxy.'
        : 'Mark prices refreshed from Express paper gateway.'
    );
  };

  const handleFlattenHolding = (holding: HoldingWithPnl) => {
    void runMutation(
      () => brokerApi.flattenPosition(holding.id),
      `Flattened ${holding.symbol} @ ${formatCurrency(holding.markPrice)}.`
    );
  };

  const handleHedgeHolding = (holding: HoldingWithPnl) => {
    const hedgeQty = Math.max(1, Math.round(holding.qty * 0.5));
    const hedgeSide = holding.side === 'LONG' ? 'SELL' : 'BUY';
    void runMutation(
      () => brokerApi.hedgePosition(holding.id),
      `Staged 50% hedge for ${holding.symbol} (${hedgeSide} ${hedgeQty} shs).`
    );
  };

  const handleSaveBracket = (
    holdingId: string,
    stopLoss?: number,
    takeProfit?: number
  ) => {
    const target = holdings.find((h) => h.id === holdingId);
    void runMutation(
      () => brokerApi.updateBracket(holdingId, stopLoss, takeProfit),
      `Saved SL/TP bracket for ${target?.symbol ?? 'position'}.`
    );
  };

  const handleSubmitNewOrder = (payload: {
    symbol: string;
    side: OrderSide;
    qty: number;
    limitPrice: number;
    tif: TimeInForce;
    route: VenueRoute;
  }) => {
    void runMutation(
      () => brokerApi.submitOrder(payload),
      `Order queued: ${payload.side} ${payload.qty} ${payload.symbol}.`
    );
  };

  const handleSaveModifiedOrder = (
    orderId: string,
    qty: number,
    limitPrice: number
  ) => {
    const existing = workingOrders.find((o) => o.id === orderId);
    void runMutation(
      () => brokerApi.modifyOrder(orderId, qty, limitPrice),
      `Updated ${existing?.symbol ?? 'working'} order.`
    );
  };

  const handleCancelOrder = (order: WorkingOrder) => {
    void runMutation(
      () => brokerApi.cancelOrder(order.id),
      `Canceled ${order.symbol} working order.`
    );
  };

  const handleCancelAllOrders = () => {
    const count = workingOrders.length;
    void runMutation(
      () => brokerApi.cancelAllOrders(),
      `Canceled ${count} working orders.`
    );
  };

  const handleToggleSleeve = (sleeveId: string) => {
    const target = sleeves.find((s) => s.id === sleeveId);
    const nextState = target && !target.armed ? 'Armed' : 'Paused';
    void runMutation(
      () => brokerApi.toggleSleeve(sleeveId),
      `${target?.code ?? 'Sleeve'} switched to ${nextState}.`
    );
  };

  const handleToggleFaultTest = (sleeveId: string) => {
    const target = sleeves.find((s) => s.id === sleeveId);
    const clearing = Boolean(target?.faultSimulated);
    void runMutation(
      () => brokerApi.toggleFaultTest(sleeveId),
      clearing
        ? `Cleared simulated fault on ${target?.code ?? 'sleeve'}.`
        : `Fail-closed guard tripped on ${target?.code ?? 'sleeve'} — execution halted.`
    );
  };

  const handleRunPreflight = () => {
    void runMutation(
      () => brokerApi.runPreflight(),
      '4-sleeve fail-closed pre-flight diagnostics complete.'
    );
  };

  const handleTogglePauseApprovals = () => {
    void runMutation(
      () => brokerApi.togglePauseApprovals(),
      approvalsPaused
        ? 'Strategy approvals resumed.'
        : 'Automated strategy approvals paused.'
    );
  };

  const handleConfirmKillSwitch = () => {
    void runMutation(
      () => brokerApi.toggleKillSwitch(),
      killSwitchEngaged
        ? 'Trading halt cleared. Re-arm sleeves manually.'
        : 'Kill Switch executed: all orders canceled and positions flattened.'
    );
  };

  const handleCycleRoadmapStatus = (taskId: string) => {
    const target = remediationTasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextStatus = nextRemediationStatus(target.status);
    setRemediationTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task
      )
    );
    if (firebaseUser) {
      const existsInCloud = cloudTaskIdsRef.current.has(taskId);
      void saveRemediationTaskState(
        firebaseUser.uid,
        taskId,
        nextStatus,
        '',
        existsInCloud
      )
        .then(() => {
          cloudTaskIdsRef.current.add(taskId);
        })
        .catch(() => {
          showNotice('Could not persist roadmap status to Firestore.');
        });
    }
  };

  const handleResetRoadmap = () => {
    setRemediationTasks(INITIAL_REMEDIATION_TASKS);
    if (firebaseUser) {
      for (const task of INITIAL_REMEDIATION_TASKS) {
        if (cloudTaskIdsRef.current.has(task.id)) {
          void saveRemediationTaskState(
            firebaseUser.uid,
            task.id,
            task.status,
            '',
            true
          ).catch(() => {});
        }
      }
    }
    showNotice('Remediation roadmap statuses reset to audit defaults.');
  };

  const handleSaveQualificationEntry = async (entry: QualificationEntry) => {
    setQualificationEntries((prev) => {
      const without = prev.filter((item) => item.entryId !== entry.entryId);
      return [entry, ...without].sort((a, b) => b.date.localeCompare(a.date));
    });
    if (firebaseUser) {
      const existsInCloud = cloudQualIdsRef.current.has(entry.entryId);
      try {
        await saveQualificationEntry(firebaseUser.uid, entry, existsInCloud);
        cloudQualIdsRef.current.add(entry.entryId);
        showNotice(`Saved Day #${entry.dayNumber} (${entry.date}) to Firestore.`);
      } catch {
        showNotice('Saved locally; Firestore write failed.');
      }
    } else {
      showNotice(
        `Logged Day #${entry.dayNumber} (${entry.date}) locally. Sign in with Google to persist in Firestore.`
      );
    }
  };

  const handleDeleteQualificationEntry = async (entryId: string) => {
    setQualificationEntries((prev) =>
      prev.filter((item) => item.entryId !== entryId)
    );
    if (firebaseUser && cloudQualIdsRef.current.has(entryId)) {
      try {
        await removeQualificationEntry(firebaseUser.uid, entryId);
        cloudQualIdsRef.current.delete(entryId);
        showNotice(`Deleted ${entryId} checkpoint from Firestore.`);
      } catch {
        showNotice('Failed to delete checkpoint from Firestore.');
      }
    } else {
      showNotice(`Removed ${entryId} checkpoint.`);
    }
  };

  const handleUpdateEngineConfig = async (patch: Partial<AutoEngineConfig>) => {
    try {
      const next = await brokerApi.updateEngineConfig(patch);
      setEngineStatus(next);
      showNotice(
        `Auto-Loop updated: ${next.config.enabled ? 'ACTIVE' : 'STANDBY'} · ${
          next.config.executionMode === 'live_paper'
            ? 'Live Paper Orders'
            : 'Dry-Run Signals'
        } (${next.config.intervalMinutes}m).`
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Failed to update engine config.'
      );
    }
  };

  const handleRunEngineCycle = async (
    sleeve: 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d'
  ) => {
    setEngineManualBusy(true);
    try {
      const { engine, portfolio } = await brokerApi.runEngineCycle(sleeve);
      setEngineStatus(engine);
      applyServerPayload(portfolio);
      showNotice(
        `Scan complete (${sleeve}): evaluated ${engine.latestSignals.length} live instruments (${engine.totalOrdersSubmitted} paper orders total).`
      );
      if (firebaseUser && portfolio.logs.length > 0) {
        void appendCloudAuditLog(firebaseUser.uid, portfolio.logs[0]).catch(
          () => {}
        );
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Failed to run automated cycle.'
      );
    } finally {
      setEngineManualBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-[#E6EDF3]">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        holdingsCount={holdings.length}
        workingOrdersCount={workingOrders.length}
        armedSleevesCount={armedSleevesCount}
        totalSleevesCount={sleeves.length}
        roadmapVerifiedCount={roadmapStats.verified}
        roadmapTotalCount={roadmapStats.total}
        qualificationDaysCount={qualificationSummary.nominalDays}
        autoEngineEnabled={Boolean(engineStatus?.config.enabled)}
        cloudSyncStatus={cloudSyncStatus}
        userDisplayName={firebaseUser?.displayName ?? null}
        onSignIn={() => void handleSignInGoogle()}
        onSignOut={() => void handleSignOutGoogle()}
        connectionMode={connectionMode}
        brokerAccount={brokerAccount}
        latencyMs={snapshot.latencyMs}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          approvalsPaused={approvalsPaused}
          killSwitchEngaged={killSwitchEngaged}
          connectionMode={connectionMode}
          onTogglePauseApprovals={handleTogglePauseApprovals}
          onOpenKillSwitch={() => setKillSwitchModalOpen(true)}
          onOpenNewOrder={() => setNewOrderOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Operational Status Notice */}
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 lg:mx-6 mt-3 flex items-center justify-between rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3.5 py-2 text-xs text-blue-900 dark:text-blue-200"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-4 font-medium text-blue-700 dark:text-blue-300 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="flex-1 px-4 lg:px-6 py-4 space-y-4 max-w-[1600px] w-full mx-auto">
          {activeSection === 'overview' && (
            <>
              <KpiStrip
                metrics={metrics}
                snapshot={snapshot}
                risk={riskSettings}
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                <div className="xl:col-span-8 space-y-4 min-w-0">
                  <HoldingsBlotter
                    holdings={visibleHoldings}
                    totalCount={holdings.length}
                    sideFilter={sideFilter}
                    searchQuery={searchQuery}
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    killSwitchEngaged={killSwitchEngaged}
                    onChangeSideFilter={setSideFilter}
                    onChangeSearch={setSearchQuery}
                    onToggleSort={handleToggleSort}
                    onRefreshMarks={handleRefreshMarks}
                    onOpenBracket={setEditingBracket}
                    onHedge={handleHedgeHolding}
                    onFlatten={handleFlattenHolding}
                    onOpenNewOrder={() => setNewOrderOpen(true)}
                  />

                  <WorkingOrdersPanel
                    orders={workingOrders}
                    killSwitchEngaged={killSwitchEngaged}
                    onModifyOrder={setEditingOrder}
                    onCancelOrder={handleCancelOrder}
                    onCancelAll={handleCancelAllOrders}
                    onOpenNewOrder={() => setNewOrderOpen(true)}
                  />
                </div>

                <div className="xl:col-span-4 space-y-4 min-w-0">
                  <TournamentSleeves
                    sleeves={sleeves}
                    killSwitchEngaged={killSwitchEngaged}
                    onToggleSleeve={handleToggleSleeve}
                  />

                  <StrategyLeaderboard
                    strategies={INITIAL_STRATEGIES}
                    sleeves={sleeves}
                    killSwitchEngaged={killSwitchEngaged}
                  />
                </div>
              </div>
            </>
          )}

          {activeSection === 'engine' && (
            <AutoTradingEngineView
              status={engineStatus}
              connectionMode={connectionMode}
              killSwitchEngaged={killSwitchEngaged}
              approvalsPaused={approvalsPaused}
              isRunningManual={engineManualBusy}
              onUpdateConfig={handleUpdateEngineConfig}
              onRunCycle={handleRunEngineCycle}
              onNotify={showNotice}
            />
          )}

          {activeSection === 'execution' && (
            <div className="space-y-4">
              <WorkingOrdersPanel
                orders={workingOrders}
                killSwitchEngaged={killSwitchEngaged}
                onModifyOrder={setEditingOrder}
                onCancelOrder={handleCancelOrder}
                onCancelAll={handleCancelAllOrders}
                onOpenNewOrder={() => setNewOrderOpen(true)}
              />
              <RecentFillsTable fills={fills} />
            </div>
          )}

          {activeSection === 'holdings' && (
            <div className="space-y-4">
              <KpiStrip
                metrics={metrics}
                snapshot={snapshot}
                risk={riskSettings}
              />
              <HoldingsBlotter
                holdings={visibleHoldings}
                totalCount={holdings.length}
                sideFilter={sideFilter}
                searchQuery={searchQuery}
                sortKey={sortKey}
                sortDirection={sortDirection}
                killSwitchEngaged={killSwitchEngaged}
                onChangeSideFilter={setSideFilter}
                onChangeSearch={setSearchQuery}
                onToggleSort={handleToggleSort}
                onRefreshMarks={handleRefreshMarks}
                onOpenBracket={setEditingBracket}
                onHedge={handleHedgeHolding}
                onFlatten={handleFlattenHolding}
                onOpenNewOrder={() => setNewOrderOpen(true)}
              />
            </div>
          )}

          {activeSection === 'tournament' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-7">
                <TournamentSleeves
                  sleeves={sleeves}
                  killSwitchEngaged={killSwitchEngaged}
                  detailed
                  onToggleSleeve={handleToggleSleeve}
                  onToggleFaultTest={handleToggleFaultTest}
                  onRunPreflight={handleRunPreflight}
                />
              </div>
              <div className="xl:col-span-5">
                <StrategyLeaderboard
                  strategies={INITIAL_STRATEGIES}
                  sleeves={sleeves}
                  killSwitchEngaged={killSwitchEngaged}
                />
              </div>
            </div>
          )}

          {activeSection === 'alpha' && (
            <div className="space-y-4">
              <StrategyAlphaChart strategies={INITIAL_STRATEGIES} />
              <StrategyLeaderboard
                strategies={INITIAL_STRATEGIES}
                sleeves={sleeves}
                killSwitchEngaged={killSwitchEngaged}
              />
            </div>
          )}

          {activeSection === 'qualification' && (
            <QualificationLogbook
              entries={qualificationEntries}
              liveEquityUsd={metrics.totalEquity}
              liveTodayPnlUsd={metrics.todayPnl}
              allSleevesNominal={sleeves.every(
                (s) => s.guardReport?.status !== 'TRIPPED'
              )}
              cloudSyncStatus={cloudSyncStatus}
              userDisplayName={firebaseUser?.displayName ?? null}
              onSignIn={() => void handleSignInGoogle()}
              onSaveEntry={handleSaveQualificationEntry}
              onDeleteEntry={handleDeleteQualificationEntry}
            />
          )}

          {activeSection === 'roadmap' && (
            <RemediationRoadmap
              tasks={remediationTasks}
              onCycleStatus={handleCycleRoadmapStatus}
              onResetDefaults={handleResetRoadmap}
              onNotify={showNotice}
            />
          )}

          {activeSection === 'logs' && (
            <EngineLogsView
              logs={mergedLogs}
              onClearLogs={() => {
                void runMutation(
                  () => brokerApi.clearLogs(),
                  'Audit log cleared.'
                );
              }}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              settings={riskSettings}
              sleeves={sleeves}
              darkMode={darkMode}
              onUpdateSettings={(next) => {
                void runMutation(
                  () => brokerApi.updateSettings(next),
                  'Risk guardrails updated on Express gateway.'
                );
              }}
              onToggleTheme={() => setDarkMode((d) => !d)}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {newOrderOpen && (
        <NewOrderModal
          defaultRoute={riskSettings.defaultRoute}
          maxOrderNotional={riskSettings.maxOrderNotional}
          onClose={() => setNewOrderOpen(false)}
          onSubmitOrder={handleSubmitNewOrder}
        />
      )}

      {editingOrder && (
        <ModifyOrderModal
          order={editingOrder}
          maxOrderNotional={riskSettings.maxOrderNotional}
          onClose={() => setEditingOrder(null)}
          onSave={handleSaveModifiedOrder}
        />
      )}

      {editingBracket && (
        <BracketModal
          holding={editingBracket}
          onClose={() => setEditingBracket(null)}
          onSave={handleSaveBracket}
        />
      )}

      {killSwitchModalOpen && (
        <KillSwitchModal
          killSwitchEngaged={killSwitchEngaged}
          holdingsCount={holdings.length}
          workingOrdersCount={workingOrders.length}
          onClose={() => setKillSwitchModalOpen(false)}
          onConfirm={handleConfirmKillSwitch}
        />
      )}
    </div>
  );
}
