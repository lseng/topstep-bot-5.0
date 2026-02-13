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
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPnl(val: number): string {
  if (val >= 0) return `+$${val.toFixed(2)}`;
  return `-$${Math.abs(val).toFixed(2)}`;
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

function stateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'active': return 'default';
    case 'tp1_hit':
    case 'tp2_hit':
    case 'tp3_hit': return 'secondary';
    case 'closed':
    case 'cancelled': return 'outline';
    default: return 'outline';
  }
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
      return <Badge variant={stateVariant(state)}>{state}</Badge>;
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
    accessorKey: 'current_sl',
    header: 'SL',
    cell: ({ getValue }) => (
      <span className="font-mono text-muted-foreground">{formatPrice(getValue<number | null>())}</span>
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
      const pnl = getValue<number>();
      return (
        <span className={`font-mono font-semibold ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {formatPnl(pnl)}
        </span>
      );
    },
  },
  {
    id: 'tp_levels',
    header: 'TP1 / TP2 / TP3',
    cell: ({ row }) => {
      const r = row.original;
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {formatPrice(r.tp1_price)} / {formatPrice(r.tp2_price)} / {formatPrice(r.tp3_price)}
        </span>
      );
    },
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
              <TableHead key={header.id}>
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
