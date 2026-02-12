import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/components/ui/card';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

interface KpiCardsProps {
  totalAlerts: number;
  successRate: number;
  failedCount: number;
  lastAlertTime: string | null;
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

export function KpiCards({
  totalAlerts,
  successRate,
  failedCount,
  lastAlertTime,
}: KpiCardsProps) {
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
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
  );
}
