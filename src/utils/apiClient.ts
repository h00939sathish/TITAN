import type {
  BrokerPortfolioPayload,
  OrderSide,
  RiskSettings,
  TimeInForce,
  VenueRoute,
} from '../types/trading';

const CONTROL_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'TitanQuantUI',
};

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const brokerApi = {
  async fetchPortfolio(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/portfolio', { cache: 'no-store' });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async submitOrder(payload: {
    symbol: string;
    side: OrderSide;
    qty: number;
    limitPrice: number;
    tif: TimeInForce;
    route: VenueRoute;
  }): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: CONTROL_HEADERS,
      body: JSON.stringify(payload),
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async modifyOrder(
    orderId: string,
    qty: number,
    limitPrice: number
  ): Promise<BrokerPortfolioPayload> {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: CONTROL_HEADERS,
      body: JSON.stringify({ qty, limitPrice }),
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async cancelOrder(orderId: string): Promise<BrokerPortfolioPayload> {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async cancelAllOrders(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/orders', {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async flattenPosition(holdingId: string): Promise<BrokerPortfolioPayload> {
    const res = await fetch(
      `/api/positions/${encodeURIComponent(holdingId)}/flatten`,
      {
        method: 'POST',
        headers: CONTROL_HEADERS,
      }
    );
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async hedgePosition(holdingId: string): Promise<BrokerPortfolioPayload> {
    const res = await fetch(
      `/api/positions/${encodeURIComponent(holdingId)}/hedge`,
      {
        method: 'POST',
        headers: CONTROL_HEADERS,
      }
    );
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async updateBracket(
    holdingId: string,
    stopLoss?: number,
    takeProfit?: number
  ): Promise<BrokerPortfolioPayload> {
    const res = await fetch(
      `/api/positions/${encodeURIComponent(holdingId)}/bracket`,
      {
        method: 'PATCH',
        headers: CONTROL_HEADERS,
        body: JSON.stringify({ stopLoss, takeProfit }),
      }
    );
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async toggleSleeve(sleeveId: string): Promise<BrokerPortfolioPayload> {
    const res = await fetch(
      `/api/sleeves/${encodeURIComponent(sleeveId)}/toggle`,
      {
        method: 'POST',
        headers: CONTROL_HEADERS,
      }
    );
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async toggleFaultTest(sleeveId: string): Promise<BrokerPortfolioPayload> {
    const res = await fetch(
      `/api/sleeves/${encodeURIComponent(sleeveId)}/fault-test`,
      {
        method: 'POST',
        headers: CONTROL_HEADERS,
      }
    );
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async runPreflight(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/sleeves/preflight', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async togglePauseApprovals(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/control/pause', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async toggleKillSwitch(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/control/kill', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async refreshMarks(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/control/refresh', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async updateSettings(
    settings: RiskSettings
  ): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: CONTROL_HEADERS,
      body: JSON.stringify(settings),
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },

  async clearLogs(): Promise<BrokerPortfolioPayload> {
    const res = await fetch('/api/logs', {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    return handleResponse<BrokerPortfolioPayload>(res);
  },
};
