import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/components/ui/card';
import { Activity, CheckCircle, XCircle, Clock, DollarSign, Target } from 'lucide-react';
import { useTick } from '@dashboard/hooks/useTick';

interface KpiCardsProps {
  totalAlerts: number;
  successRate: number;
  failedCount: number;
  lastAlertTime: string | null;
  totalPnl?: number;
  activePositions?: number;
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

function formatPnl(val: number): string {
  const prefix = val >= 0 ? '+' : '';
  return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function KpiCards({
  totalAlerts,
  successRate,
  failedCount,
  lastAlertTime,
  totalPnl,
  activePositions,
}: KpiCardsProps) {
  useTick();
  const cards: { title: string; value: string; icon: typeof Activity; className?: string }[] = [
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
  ];

  if (totalPnl !== undefined) {
    cards.push({
      title: 'Total P&L',
      value: formatPnl(totalPnl),
      icon: DollarSign,
      className: totalPnl >= 0 ? 'text-green-500' : 'text-red-500',
    });
  }

  if (activePositions !== undefined) {
    cards.push({
      title: 'Active Positions',
      value: activePositions.toLocaleString(),
      icon: Target,
    });
  }

  return (
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
            <div className={`text-2xl font-bold ${card.className ?? ''}`}>{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
