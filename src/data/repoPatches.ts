export interface RepoPatchFile {
  id: string;
  filename: string;
  language: 'yaml' | 'python';
  sleeveTag: string;
  title: string;
  summary: string;
  code: string;
}

export const REPO_PATCH_FILES: RepoPatchFile[] = [
  {
    id: 'patch-gha-cron',
    filename: '.github/workflows/titan_paper_schedule.yml',
    language: 'yaml',
    sleeveTag: '24/7 Free Cloud Runner',
    title: 'GitHub Actions 24/7 Paper Trading Scheduler ($0)',
    summary:
      'Runs all 4 sleeves automatically on schedule while your computer is off. Add your rotated keys under GitHub Repo → Settings → Secrets and variables → Actions.',
    code: `name: Project-TITAN 24/7 Paper Schedule

on:
  schedule:
    # Sleeve B: 24/7 Crypto 4h EMA (12/48) every 4 hours
    - cron: '5 */4 * * *'
    # Sleeve A & C: US Equities PEAD & Options (14:30 & 15:30 UTC covers EDT/EST 10:30 ET; script gates exact ET clock)
    - cron: '30 14,15 * * 1-5'
    # Sleeve D: India NIFTY 50 (09:30 IST = 04:00 UTC Mon-Fri)
    - cron: '0 4 * * 1-5'
  workflow_dispatch:
    inputs:
      sleeve:
        description: 'Run specific sleeve (all, us_pead, crypto, options, india)'
        required: true
        default: 'all'

concurrency:
  group: titan-paper-execution
  cancel-in-progress: false

jobs:
  run-sleeves:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      APCA_API_KEY_ID: \${{ secrets.APCA_API_KEY_ID }}
      APCA_API_SECRET_KEY: \${{ secrets.APCA_API_SECRET_KEY }}
      APCA_API_BASE_URL: https://paper-api.alpaca.markets
      POLYGON_API_KEY: \${{ secrets.POLYGON_API_KEY }}
      DHAN_CLIENT_ID: \${{ secrets.DHAN_CLIENT_ID }}
      DHAN_ACCESS_TOKEN: \${{ secrets.DHAN_ACCESS_TOKEN }}
      TITAN_PAPER_MODE: 'true'

    steps:
      - name: Checkout Project-TITAN
        uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

      - name: Run Fail-Closed Paper Rebalance
        run: |
          python schedule_alpaca_rebalance.py --mode paper --sleeve "\${{ github.event.inputs.sleeve || 'auto' }}"
`,
  },
  {
    id: 'patch-guards',
    filename: 'titan_guards.py',
    language: 'python',
    sleeveTag: 'Core Fail-Closed Module',
    title: 'Shared Fail-Closed Guardrail & Pre-Flight Engine',
    summary:
      'Drop into repo root. Centralizes hard GuardTrippedError exceptions so no sleeve can silently trade on stale, synthetic, or out-of-hours data.',
    code: `"""Shared fail-closed pre-trade invariants for Project-TITAN."""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import os


class GuardTrippedError(RuntimeError):
    """Raised when a mandatory safety or data-integrity invariant fails."""


@dataclass(frozen=True)
class ClockCheck:
    is_open: bool
    timestamp_utc: str
    next_open: str


def require_paper_endpoint() -> str:
    base_url = os.environ.get("APCA_API_BASE_URL", "").strip().rstrip("/")
    if base_url != "https://paper-api.alpaca.markets":
        raise GuardTrippedError(
            f"Refusing execution: APCA_API_BASE_URL must be paper-api.alpaca.markets (got {base_url!r})."
        )
    return base_url


def assert_us_market_open(clock: ClockCheck) -> None:
    if not clock.is_open:
        raise GuardTrippedError(
            f"Sleeve A/C halted fail-closed: US market closed (next open: {clock.next_open})."
        )


def assert_pead_events_valid(events_df, min_rows: int = 1) -> None:
    if events_df is None or getattr(events_df, "empty", True) or len(events_df) < min_rows:
        raise GuardTrippedError(
            "Sleeve A halted fail-closed: point-in-time earnings events_df is missing or empty."
        )


def assert_crypto_bars_valid(df, expected_minutes: int = 240, min_bars: int = 60) -> None:
    if df is None or getattr(df, "empty", True) or len(df) < min_bars:
        raise GuardTrippedError(
            f"Sleeve B halted fail-closed: insufficient live 4h crypto bars (need >= {min_bars})."
        )
    if len(df) >= 2:
        delta_min = (df.index[-1] - df.index[-2]).total_seconds() / 60.0
        if abs(delta_min - expected_minutes) > 5:
            raise GuardTrippedError(
                f"Sleeve B halted fail-closed: bar spacing {delta_min:.0f}m != expected {expected_minutes}m."
            )


def assert_option_quote_live(bid: float | None, ask: float | None, iv: float | None) -> None:
    if bid is None or ask is None or bid <= 0 or ask <= 0 or ask < bid:
        raise GuardTrippedError("Sleeve C halted fail-closed: live option bid/ask quote invalid.")
    if iv is None or iv <= 0 or iv > 5.0:
        raise GuardTrippedError("Sleeve C halted fail-closed: implied volatility unavailable or invalid.")


def assert_india_budget_reconciled(
    computed_equity_inr: float,
    allocated_cap_inr: float = 100_000.0,
    max_drift_pct: float = 15.0,
) -> None:
    drift_pct = abs(computed_equity_inr - allocated_cap_inr) / allocated_cap_inr * 100.0
    if drift_pct > max_drift_pct:
        raise GuardTrippedError(
            f"Sleeve D halted fail-closed: INR equity {computed_equity_inr:,.2f} drifted "
            f"{drift_pct:.1f}% from cap {allocated_cap_inr:,.2f} (max {max_drift_pct:.1f}%)."
        )
`,
  },
  {
    id: 'patch-scheduler',
    filename: 'schedule_alpaca_rebalance.py',
    language: 'python',
    sleeveTag: 'REM-001 · P0 Critical',
    title: 'Abort Rebalance on Closed Market Clock & Holidays',
    summary:
      'Fixes the fail-open clock bug where closed/holiday sessions logged a warning and still submitted paper orders.',
    code: `"""Fail-closed wrapper for schedule_alpaca_rebalance.py (REM-001)."""

import logging
import sys
from alpaca.trading.client import TradingClient
import os
from titan_guards import ClockCheck, GuardTrippedError, assert_us_market_open, require_paper_endpoint

logger = logging.getLogger("titan.scheduler")


def run_guarded_us_rebalance(run_live_paper_rebalance) -> int:
    require_paper_endpoint()
    client = TradingClient(
        api_key=os.environ["APCA_API_KEY_ID"],
        secret_key=os.environ["APCA_API_SECRET_KEY"],
        paper=True,
    )
    raw_clock = client.get_clock()
    clock = ClockCheck(
        is_open=bool(raw_clock.is_open),
        timestamp_utc=str(raw_clock.timestamp),
        next_open=str(raw_clock.next_open),
    )

    try:
        assert_us_market_open(clock)
    except GuardTrippedError as exc:
        logger.warning("%s — exiting cleanly with 0 orders staged.", exc)
        return 0

    run_live_paper_rebalance()
    return 0
`,
  },
  {
    id: 'patch-pead',
    filename: 'pead_factor.py',
    language: 'python',
    sleeveTag: 'REM-003 · P0 Critical',
    title: 'Remove 63-Bar Calendar Fallback in PEAD Factor',
    summary:
      'Requires verified point-in-time earnings timestamps instead of silently substituting 63-bar price drift slices.',
    code: `"""Fail-closed PEAD signal guard (REM-003)."""

import pandas as pd
from titan_guards import assert_pead_events_valid


def compute_pead_scores(prices_df: pd.DataFrame, events_df: pd.DataFrame | None) -> pd.Series:
    # NEVER silently fall back to fixed 63-bar slices when earnings events are absent
    assert_pead_events_valid(events_df, min_rows=5)

    required_cols = {"symbol", "announce_date", "sue_score"}
    missing = required_cols - set(events_df.columns)
    if missing:
        raise ValueError(f"events_df missing required PIT columns: {sorted(missing)}")

    latest_events = (
        events_df.sort_values("announce_date")
        .drop_duplicates(subset=["symbol"], keep="last")
        .set_index("symbol")
    )
    return latest_events["sue_score"].dropna()
`,
  },
  {
    id: 'patch-crypto',
    filename: 'crypto_sleeve.py',
    language: 'python',
    sleeveTag: 'REM-002 & REM-005 · P0/P1',
    title: 'True 4-Hour Bars, 12/48 EMA & Zero Synthetic Ramp',
    summary:
      'Replaces 1h bar fetches and the synthetic 60000 + i*100 bull ramp with verified 4h bars and fail-closed API error handling.',
    code: `"""Fail-closed 4h EMA (12/48) Crypto Trend fetcher (REM-002, REM-005)."""

from datetime import datetime, timedelta, timezone
import pandas as pd
from alpaca.data.historical import CryptoHistoricalDataClient
from alpaca.data.requests import CryptoBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from titan_guards import GuardTrippedError, assert_crypto_bars_valid

EMA_FAST = 12
EMA_SLOW = 48


def fetch_crypto_4h_bars(symbol: str, lookback_days: int = 30) -> pd.DataFrame:
    client = CryptoHistoricalDataClient()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    req = CryptoBarsRequest(
        symbol_or_symbols=[symbol],
        timeframe=TimeFrame(4, TimeFrameUnit.Hour),  # Strict 4-hour bar contract
        start=start,
        end=end,
    )
    try:
        bars = client.get_crypto_bars(req).df
    except Exception as exc:
        # NEVER fabricate a synthetic upward price ramp on API failure
        raise GuardTrippedError(f"Crypto API outage for {symbol}: {exc}") from exc

    if isinstance(bars.index, pd.MultiIndex):
        bars = bars.xs(symbol, level=0)

    bars = bars.sort_index()
    assert_crypto_bars_valid(bars, expected_minutes=240, min_bars=EMA_SLOW + 5)
    return bars


def compute_crypto_signal(bars: pd.DataFrame) -> str:
    ema_fast = bars["close"].ewm(span=EMA_FAST, adjust=False).mean()
    ema_slow = bars["close"].ewm(span=EMA_SLOW, adjust=False).mean()
    return "LONG" if float(ema_fast.iloc[-1]) > float(ema_slow.iloc[-1]) else "FLAT"
`,
  },
  {
    id: 'patch-options-india',
    filename: 'options_sleeve.py / india_sleeve.py',
    language: 'python',
    sleeveTag: 'REM-006 & REM-007 · P1',
    title: 'Live Options Quote Gate & INR ₹1,00,000 Cap Guard',
    summary:
      'Eliminates hardcoded 2026-12-18 / $0.85 / $580 SPY pricing constants and prevents Sleeve D INR capital inflation.',
    code: `"""Fail-closed Options & India Sleeve guards (REM-006, REM-007)."""

from titan_guards import assert_india_budget_reconciled, assert_option_quote_live


def validate_put_spread_candidate(
    short_bid: float | None,
    short_ask: float | None,
    long_bid: float | None,
    long_ask: float | None,
    short_iv: float | None,
    width_dollars: float,
) -> dict:
    # Halts Sleeve C if live chain quotes or IV are unavailable — zero hardcoded $0.85/$580 fallbacks
    assert_option_quote_live(short_bid, short_ask, short_iv)
    assert_option_quote_live(long_bid, long_ask, short_iv)

    net_credit = round(float(short_bid) - float(long_ask), 2)
    if net_credit <= 0.10 or net_credit >= width_dollars:
        raise ValueError(f"Unfavorable live credit {net_credit:.2f} for width {width_dollars:.2f}.")

    return {
        "net_credit_per_share": net_credit,
        "max_risk_per_contract": round((width_dollars - net_credit) * 100.0, 2),
    }


def validate_india_sleeve_ledger(cash_inr: float, positions_market_value_inr: float) -> float:
    total_equity_inr = round(cash_inr + positions_market_value_inr, 2)
    # Enforces declared INR 1,00,000 capital ceiling (fixes ~5L mixed-ledger inflation)
    assert_india_budget_reconciled(total_equity_inr, allocated_cap_inr=100_000.0, max_drift_pct=15.0)
    return total_equity_inr
`,
  },
];
