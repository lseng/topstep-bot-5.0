import { useState, Fragment } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@dashboard/components/ui/table';
import { StatusBadge } from '@dashboard/components/StatusBadge';
import { ActionBadge } from '@dashboard/components/ActionBadge';
import { AlertDetailPanel } from '@dashboard/components/AlertDetailPanel';
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useTick } from '@dashboard/hooks/useTick';

interface AlertRow {
  id: string;
  created_at: string;
  symbol: string;
  action: 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';
  quantity: number;
  order_type: string | null;
  price: number | null;
  status: 'received' | 'processing' | 'executed' | 'failed' | 'cancelled';
  raw_payload: Record<string, unknown>;
  comment?: string | null;
  order_id?: string | null;
}

interface AlertsTableProps {
  data: AlertRow[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function extractOHLCV(raw: Record<string, unknown>) {
  const open = typeof raw.open === 'number' ? raw.open : null;
  const high = typeof raw.high === 'number' ? raw.high : null;
  const low = typeof raw.low === 'number' ? raw.low : null;
  const close = typeof raw.close === 'number' ? raw.close : null;
  const volume = typeof raw.volume === 'number' ? raw.volume : null;
  if (open == null && high == null && low == null && close == null && volume == null) {
    return undefined;
  }
  return { open, high, low, close, volume };
}

const columns: ColumnDef<AlertRow>[] = [
  {
    id: 'expand',
    header: '',
    cell: ({ row }) => (
      <button
        onClick={() => row.toggleExpanded()}
        className="p-1 text-muted-foreground hover:text-foreground"
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>
    ),
    size: 32,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Time
        <ArrowUpDown className="size-3" />
      </button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground font-mono text-xs">
        {formatRelativeTime(getValue<string>())}
      </span>
    ),
  },
  {
    accessorKey: 'symbol',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Symbol
        <ArrowUpDown className="size-3" />
      </button>
    ),
    cell: ({ getValue }) => (
      <span className="font-semibold">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ getValue }) => <ActionBadge action={getValue<AlertRow['action']>()} />,
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ getValue }) => (
      <span className="font-mono">{getValue<number>()}</span>
    ),
  },
  {
    accessorKey: 'order_type',
    header: 'Type',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue<string>() ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue<AlertRow['status']>()} />,
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Price
        <ArrowUpDown className="size-3" />
      </button>
    ),
    cell: ({ getValue }) => {
      const price = getValue<number | null>();
      return (
        <span className="font-mono">
          {price != null ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
        </span>
      );
    },
  },
];

function ExpandedRow({ row }: { row: Row<AlertRow> }) {
  const alert = row.original;
  const raw = alert.raw_payload;
  const ohlcv = extractOHLCV(raw);
  const interval = typeof raw.interval === 'string' ? raw.interval : undefined;
  const alertTime = typeof raw.alertTime === 'string' ? raw.alertTime : undefined;

  return (
    <AlertDetailPanel
      ohlcv={ohlcv}
      interval={interval}
      alertTime={alertTime}
      comment={alert.comment}
      orderId={alert.order_id}
      status={alert.status}
    />
  );
}

export function AlertsTable({
  data,
  sorting,
  onSortingChange,
}: AlertsTableProps) {
  useTick();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      expanded,
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualSorting: true,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} style={{ width: header.getSize() }}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow data-state={row.getIsExpanded() ? 'selected' : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {row.getIsExpanded() && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <ExpandedRow row={row} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center text-muted-foreground"
            >
              No alerts found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
