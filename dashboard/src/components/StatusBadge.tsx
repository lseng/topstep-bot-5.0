import { Badge } from '@dashboard/components/ui/badge';
import { cn } from '@dashboard/lib/utils';

const statusConfig = {
  received: {
    label: 'Received',
    className: 'bg-info/20 text-info border-info/30',
  },
  processing: {
    label: 'Processing',
    className: 'bg-warning/20 text-warning border-warning/30 animate-pulse',
  },
  executed: {
    label: 'Executed',
    className: 'bg-success/20 text-success border-success/30',
  },
  failed: {
    label: 'Failed',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground border-border',
  },
} as const;

type Status = keyof typeof statusConfig;

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
