import { Input } from '@dashboard/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@dashboard/components/ui/select';
import { Button } from '@dashboard/components/ui/button';
import { X } from 'lucide-react';

export interface FilterState {
  symbol: string;
  action: string;
  status: string;
  from: string;
  to: string;
}

interface AlertsFilterProps {
  filters: FilterState;
  symbols: string[];
  onFilterChange: (filters: FilterState) => void;
}

export function AlertsFilter({
  filters,
  symbols,
  onFilterChange,
}: AlertsFilterProps) {
  const updateFilter = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasFilters = Object.values(filters).some((v) => v !== '');

  const clearFilters = () => {
    onFilterChange({ symbol: '', action: '', status: '', from: '', to: '' });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.symbol || undefined}
        onValueChange={(v) => updateFilter('symbol', v)}
      >
        <SelectTrigger className="w-[140px]" size="sm">
          <SelectValue placeholder="Symbol" />
        </SelectTrigger>
        <SelectContent>
          {symbols.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.action || undefined}
        onValueChange={(v) => updateFilter('action', v)}
      >
        <SelectTrigger className="w-[140px]" size="sm">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="buy">Buy</SelectItem>
          <SelectItem value="sell">Sell</SelectItem>
          <SelectItem value="close">Close</SelectItem>
          <SelectItem value="close_long">Close Long</SelectItem>
          <SelectItem value="close_short">Close Short</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.status || undefined}
        onValueChange={(v) => updateFilter('status', v)}
      >
        <SelectTrigger className="w-[140px]" size="sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="received">Received</SelectItem>
          <SelectItem value="processing">Processing</SelectItem>
          <SelectItem value="executed">Executed</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="date"
        placeholder="From"
        value={filters.from}
        onChange={(e) => updateFilter('from', e.target.value)}
        className="w-[140px] h-8 text-sm"
      />

      <Input
        type="date"
        placeholder="To"
        value={filters.to}
        onChange={(e) => updateFilter('to', e.target.value)}
        className="w-[140px] h-8 text-sm"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="size-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
