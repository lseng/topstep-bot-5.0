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
import type { TradeLogRow } from '@dashboard/hooks/useTradeLog';

interface TradeLogTableProps {
  data: TradeLogRow[];
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const columns: ColumnDef<TradeLogRow>[] = [
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
      <span className="text-muted-foreground text-xs">
        {formatTime(getValue<string>())}
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
    accessorKey: 'account_id',
    header: 'Account',
    cell: ({ getValue }) => {
      const acctId = getValue<number | null>();
      return (
        <span className="font-mono text-xs text-muted-foreground">{acctId ?? '---'}</span>
      );
    },
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
    accessorKey: 'entry_price',
    header: 'Entry',
    cell: ({ getValue }) => (
      <span className="font-mono">{formatPrice(getValue<number>())}</span>
    ),
  },
  {
    accessorKey: 'exit_price',
    header: 'Exit',
    cell: ({ getValue }) => (
      <span className="font-mono">{formatPrice(getValue<number>())}</span>
    ),
  },
  {
    accessorKey: 'net_pnl',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Net P&L
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
    accessorKey: 'exit_reason',
    header: 'Exit Reason',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'highest_tp_hit',
    header: 'Best TP',
    cell: ({ getValue }) => {
      const tp = getValue<string | null>();
      if (!tp) return <span className="text-muted-foreground">—</span>;
      return <Badge variant="secondary">{tp.toUpperCase()}</Badge>;
    },
  },
];

export function TradeLogTable({
  data,
  sorting,
  onSortingChange,
}: TradeLogTableProps) {
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
              No trades found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
