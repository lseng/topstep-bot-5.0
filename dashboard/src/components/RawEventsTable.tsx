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
    accessorKey: 'source',
    header: 'Source',
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue<string | null>() ?? '---'}</span>
    ),
  },
  {
    accessorKey: 'content_type',
    header: 'Content Type',
    cell: ({ getValue }) => {
      const ct = getValue<string | null>();
      return (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
          {ct ?? '---'}
        </span>
      );
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
