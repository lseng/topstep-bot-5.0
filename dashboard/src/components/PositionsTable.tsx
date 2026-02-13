import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@dashboard/components/ui/table';
import { Badge } from '@dashboard/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { useTick } from '@dashboard/hooks/useTick';
import type { PositionRow } from '@dashboard/hooks/usePositions';

interface PositionsTableProps {
  data: PositionRow[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

function formatPrice(val: number | null): string {
  if (val == null) return '—';
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatPnl(val: number | null): string {
  if (val == null) return '—';
  const prefix = val >= 0 ? '+' : '';
  return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlColor(val: number | null): string {
  if (val == null) return 'text-muted-foreground';
  if (val > 0) return 'text-green-500';
  if (val < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

function stateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'active':
    case 'tp1_hit':
    case 'tp2_hit':
    case 'tp3_hit':
      return 'default';
    case 'pending_entry':
      return 'secondary';
    case 'closed':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
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

const columns: ColumnDef<PositionRow>[] = [
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
    accessorKey: 'side',
    header: 'Side',
    cell: ({ getValue }) => {
      const side = getValue<string>();
      return (
        <Badge variant={side === 'long' ? 'default' : 'destructive'}>
          {side.toUpperCase()}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'state',
    header: 'State',
    cell: ({ getValue }) => {
      const state = getValue<string>();
      return <Badge variant={stateVariant(state)}>{state.replace(/_/g, ' ')}</Badge>;
    },
  },
  {
    accessorKey: 'entry_price',
    header: 'Entry',
    cell: ({ getValue }) => (
      <span className="font-mono">{formatPrice(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'last_price',
    header: 'Last',
    cell: ({ getValue }) => (
      <span className="font-mono">{formatPrice(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'unrealized_pnl',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        P&L
        <ArrowUpDown className="size-3" />
      </button>
    ),
    cell: ({ getValue }) => {
      const val = getValue<number | null>();
      return <span className={`font-mono font-semibold ${pnlColor(val)}`}>{formatPnl(val)}</span>;
    },
  },
  {
    accessorKey: 'current_sl',
    header: 'SL',
    cell: ({ getValue }) => (
      <span className="font-mono text-red-400">{formatPrice(getValue<number | null>())}</span>
    ),
  },
  {
    id: 'targets',
    header: 'TP1 / TP2 / TP3',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatPrice(row.original.tp1_price)} / {formatPrice(row.original.tp2_price)} / {formatPrice(row.original.tp3_price)}
      </span>
    ),
  },
];

export function PositionsTable({
  data,
  sorting,
  onSortingChange,
}: PositionsTableProps) {
  useTick();

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
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
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center text-muted-foreground"
            >
              No positions found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
