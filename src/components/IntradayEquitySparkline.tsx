import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import {
  buildSparklineSeries,
  formatCurrency,
  formatSignedCurrency,
  type SparklinePoint,
} from '../utils/portfolioEngine';

interface IntradayEquitySparklineProps {
  points: number[];
  positive: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SparklinePoint }>;
}

function SparklineTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const isUp = point.deltaFromOpen >= 0;

  return (
    <div className="rounded-md border border-slate-200 dark:border-[#242E40] bg-white/95 dark:bg-[#0D1119]/95 px-2 py-1 shadow-lg text-[11px] leading-tight pointer-events-none">
      <p className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
        {point.timeLabel}
      </p>
      <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
        {formatCurrency(point.equity)}
      </p>
      <p
        className={`font-mono tabular-nums text-[10px] ${
          isUp
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
        }`}
      >
        {formatSignedCurrency(point.deltaFromOpen)}
      </p>
    </div>
  );
}

export function IntradayEquitySparkline({
  points,
  positive,
}: IntradayEquitySparklineProps) {
  const gradientId = useId().replace(/:/g, '');
  const data = useMemo(() => buildSparklineSeries(points), [points]);

  if (data.length < 2) {
    return (
      <div
        data-testid="intraday-equity-sparkline"
        className="h-8 w-28 flex items-center justify-end text-[10px] font-mono text-slate-400 dark:text-slate-500"
      >
        No intraday data
      </div>
    );
  }

  const strokeColor = positive ? '#10B981' : '#EF4444';

  return (
    <div
      data-testid="intraday-equity-sparkline"
      aria-label="Intraday equity trend sparkline"
      role="img"
      className="h-8 w-28 shrink-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            content={<SparklineTooltip />}
            cursor={{ stroke: strokeColor, strokeWidth: 1, strokeOpacity: 0.45 }}
            wrapperStyle={{ zIndex: 40 }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={strokeColor}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{
              r: 2.5,
              fill: strokeColor,
              strokeWidth: 0,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
