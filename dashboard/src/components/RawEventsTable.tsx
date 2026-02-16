import { useState, Fragment } from 'react';
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
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';

interface RawEventRow {
  id: string;
  created_at: string;
  source: string | null;
  raw_body: string;
  content_type: string | null;
  ticker: string | null;
  symbol: string | null;
  alert_type: string | null;
  signal_direction: string | null;
  price: number | null;
  current_rating: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stop_loss: number | null;
  entry_price: number | null;
  unix_time: number | null;
}

interface RawEventsTableProps {
  data: RawEventRow[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  emptyMessage?: string;
}

function formatTime12h(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const hours = d.getHours();
  const h12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  const hh = h12.toString();
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return `${hh}:${mm}:${ss} ${ampm}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}:${ss} ${ampm}`;
}

function formatPrice(val: number | null): string {
  if (val == null) return '---';
  return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const alertTypeBadge: Record<string, string> = {
  buy: 'bg-green-500/20 text-green-400',
  sell: 'bg-red-500/20 text-red-400',
  TP1: 'bg-blue-500/20 text-blue-400',
  TP2: 'bg-blue-500/20 text-blue-400',
  TP3: 'bg-blue-500/20 text-blue-400',
  sl: 'bg-orange-500/20 text-orange-400',
};

const columns: ColumnDef<RawEventRow>[] = [
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
        {formatTime12h(getValue<string>())}
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
      <span className="font-mono text-sm font-medium">{getValue<string | null>() ?? '---'}</span>
    ),
  },
  {
    accessorKey: 'alert_type',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Type
        <ArrowUpDown className="size-3" />
      </button>
    ),
    cell: ({ getValue }) => {
      const t = getValue<string | null>();
      if (!t) return <span className="text-muted-foreground">---</span>;
      const cls = alertTypeBadge[t] ?? 'bg-muted text-muted-foreground';
      return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
          {t.toUpperCase()}
        </span>
      );
    },
  },
  {
    accessorKey: 'signal_direction',
    header: 'Dir',
    cell: ({ getValue }) => {
      const d = getValue<string | null>();
      if (!d) return <span className="text-muted-foreground">---</span>;
      return (
        <span className={`text-xs font-medium ${d === 'bull' ? 'text-green-400' : 'text-red-400'}`}>
          {d === 'bull' ? 'BULL' : 'BEAR'}
        </span>
      );
    },
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
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{formatPrice(getValue<number | null>())}</span>
    ),
  },
  {
    accessorKey: 'current_rating',
    header: 'Rating',
    cell: ({ getValue }) => {
      const r = getValue<number | null>();
      if (r == null) return <span className="text-muted-foreground">---</span>;
      return <span className="font-mono text-xs">{r}</span>;
    },
  },
  {
    id: 'targets',
    header: 'TP1 / TP2 / TP3',
    cell: ({ row }) => {
      const { tp1, tp2, tp3 } = row.original;
      if (tp1 == null && tp2 == null && tp3 == null) return <span className="text-muted-foreground">---</span>;
      return (
        <span className="font-mono text-xs text-blue-400">
          {formatPrice(tp1)} / {formatPrice(tp2)} / {formatPrice(tp3)}
        </span>
      );
    },
  },
  {
    accessorKey: 'stop_loss',
    header: 'SL',
    cell: ({ getValue }) => {
      const sl = getValue<number | null>();
      if (sl == null) return <span className="text-muted-foreground">---</span>;
      return <span className="font-mono text-xs text-orange-400">{formatPrice(sl)}</span>;
    },
  },
  {
    accessorKey: 'entry_price',
    header: 'Entry',
    cell: ({ getValue }) => {
      const ep = getValue<number | null>();
      if (ep == null) return <span className="text-muted-foreground">---</span>;
      return <span className="font-mono text-xs">{formatPrice(ep)}</span>;
    },
  },
];

export function RawEventsTable({
  data,
  sorting,
  onSortingChange,
  emptyMessage = 'No events found.',
}: RawEventsTableProps) {
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
                    <pre className="p-4 bg-muted/50 text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                      {row.original.raw_body}
                    </pre>
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
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
