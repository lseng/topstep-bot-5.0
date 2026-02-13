import { Card, CardContent, CardHeader, CardTitle } from '@dashboard/components/ui/card';
import { Lock } from 'lucide-react';

interface OHLCVData {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface VpvrData {
  poc: number | null;
  vah: number | null;
  val: number | null;
  confirmationScore: number | null;
}

interface AlertDetailPanelProps {
  ohlcv?: OHLCVData;
  vpvr?: VpvrData;
  interval?: string;
  alertTime?: string;
  comment?: string | null;
  orderId?: string | null;
  status: string;
}

function formatNumber(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function AlertDetailPanel({
  ohlcv,
  vpvr,
  interval,
  alertTime,
  comment,
  orderId,
  status,
}: AlertDetailPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Alert Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ohlcv && (
            <div className="grid grid-cols-5 gap-2">
              <div>
                <span className="text-muted-foreground">O</span>
                <div className="font-mono">{formatNumber(ohlcv.open)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">H</span>
                <div className="font-mono">{formatNumber(ohlcv.high)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">L</span>
                <div className="font-mono">{formatNumber(ohlcv.low)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">C</span>
                <div className="font-mono">{formatNumber(ohlcv.close)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">V</span>
                <div className="font-mono">
                  {ohlcv.volume != null ? ohlcv.volume.toLocaleString() : '—'}
                </div>
              </div>
            </div>
          )}
          {interval && (
            <div>
              <span className="text-muted-foreground">Interval: </span>
              <span>{interval}</span>
            </div>
          )}
          {alertTime && (
            <div>
              <span className="text-muted-foreground">Alert Time: </span>
              <span>{new Date(alertTime).toLocaleString()}</span>
            </div>
          )}
          {comment && (
            <div>
              <span className="text-muted-foreground">Comment: </span>
              <span>{comment}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {vpvr && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">VPVR Levels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-muted-foreground">POC</span>
                <div className="font-mono font-semibold">{formatNumber(vpvr.poc)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">VAH</span>
                <div className="font-mono">{formatNumber(vpvr.vah)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">VAL</span>
                <div className="font-mono">{formatNumber(vpvr.val)}</div>
              </div>
            </div>
            {vpvr.confirmationScore != null && (
              <div>
                <span className="text-muted-foreground">Confirmation Score: </span>
                <span className="font-mono font-semibold">{vpvr.confirmationScore}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="opacity-60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="size-3" />
            Execution (Coming Soon)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            TopstepX execution will be available in a future update. This alert
            was received and stored successfully.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <span className="text-muted-foreground">Order ID: </span>
              <span>{orderId ?? 'pending'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span>{status}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fill Price: </span>
              <span>—</span>
            </div>
            <div>
              <span className="text-muted-foreground">P&L: </span>
              <span>—</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
