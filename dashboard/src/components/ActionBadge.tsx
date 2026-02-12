import { Badge } from '@dashboard/components/ui/badge';
import { cn } from '@dashboard/lib/utils';

const actionConfig = {
  buy: {
    label: 'BUY',
    className: 'bg-success/20 text-success border-success/30',
  },
  sell: {
    label: 'SELL',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
  },
  close: {
    label: 'CLOSE',
    className: 'bg-muted text-muted-foreground border-border',
  },
  close_long: {
    label: 'CLOSE LONG',
    className: 'bg-muted text-muted-foreground border-border',
  },
  close_short: {
    label: 'CLOSE SHORT',
    className: 'bg-muted text-muted-foreground border-border',
  },
} as const;

type Action = keyof typeof actionConfig;

export function ActionBadge({ action }: { action: Action }) {
  const config = actionConfig[action];
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
