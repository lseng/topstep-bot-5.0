import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/components/ui/card';
import { Activity, CheckCircle, XCircle, Clock, TrendingUp, DollarSign } from 'lucide-react';
import { useTick } from '@dashboard/hooks/useTick';

interface KpiCardsProps {
  totalAlerts: number;
  successRate: number;
  failedCount: number;
  lastAlertTime: string | null;
  openPositions?: number;
  totalPnl?: number;
  perSymbolPnl?: Record<string, number>;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'No alerts';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPnl(val: number | undefined): string {
  if (val == null) return '—';
  if (val >= 0) return `+$${val.toFixed(2)}`;
  return `-$${Math.abs(val).toFixed(2)}`;
}

export function KpiCards({
  totalAlerts,
  successRate,
  failedCount,
  lastAlertTime,
  openPositions,
  totalPnl,
  perSymbolPnl,
}: KpiCardsProps) {
  useTick();
  const cards = [
    {
      title: 'Total Alerts',
      value: totalAlerts.toLocaleString(),
      icon: Activity,
    },
    {
      title: 'Success Rate',
      value: `${successRate.toFixed(1)}%`,
      icon: CheckCircle,
    },
    {
      title: 'Failed Count',
      value: failedCount.toLocaleString(),
      icon: XCircle,
    },
    {
      title: 'Last Alert',
      value: formatRelativeTime(lastAlertTime),
      icon: Clock,
    },
    {
      title: 'Open Positions',
      value: openPositions != null ? openPositions.toLocaleString() : '—',
      icon: TrendingUp,
    },
    {
      title: 'Total P&L',
      value: formatPnl(totalPnl),
      icon: DollarSign,
    },
  ];

  const symbolEntries = perSymbolPnl ? Object.entries(perSymbolPnl).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {symbolEntries.length > 1 && (
        <div className="flex gap-4 flex-wrap">
          {symbolEntries.map(([sym, pnl]) => (
            <div key={sym} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sym}</span>{' '}
              <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatPnl(pnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
