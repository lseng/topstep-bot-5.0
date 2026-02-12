import { useState, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { DashboardLayout } from '@dashboard/components/DashboardLayout';
import { LoginPage } from '@dashboard/components/LoginPage';
import { KpiCards } from '@dashboard/components/KpiCards';
import { AlertsFilter, type FilterState } from '@dashboard/components/AlertsFilter';
import { AlertsTable } from '@dashboard/components/AlertsTable';
import { Pagination } from '@dashboard/components/Pagination';
import { useAuth } from '@dashboard/hooks/useAuth';
import { useAlerts } from '@dashboard/hooks/useAlerts';
import { useRealtimeAlerts } from '@dashboard/hooks/useRealtimeAlerts';

export function App() {
  const { user, isLoading: authLoading, signIn, signOut } = useAuth();
  const { isConnected } = useRealtimeAlerts();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [filters, setFilters] = useState<FilterState>({
    symbol: '',
    action: '',
    status: '',
    from: '',
    to: '',
  });

  const sortColumn = sorting[0]?.id ?? 'created_at';
  const sortOrder = sorting[0]?.desc ? 'desc' : 'asc';

  const { data: alertsData, isLoading: alertsLoading } = useAlerts({
    page,
    limit,
    symbol: filters.symbol || undefined,
    action: filters.action || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sortColumn,
    order: sortOrder,
  });

  const alerts = alertsData?.data ?? [];
  const pagination = alertsData?.pagination ?? {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  };

  const symbols = useMemo(() => {
    const set = new Set(alerts.map((a) => a.symbol));
    return Array.from(set).sort();
  }, [alerts]);

  const kpiStats = useMemo(() => {
    const total = pagination.total;
    const executed = alerts.filter((a) => a.status === 'executed').length;
    const failed = alerts.filter((a) => a.status === 'failed').length;
    const successRate = total > 0 ? (executed / alerts.length) * 100 : 0;
    const lastAlert = alerts.length > 0 ? alerts[0].created_at : null;
    return { totalAlerts: total, successRate, failedCount: failed, lastAlertTime: lastAlert };
  }, [alerts, pagination.total]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={signIn} />;
  }

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  return (
    <DashboardLayout isConnected={isConnected} onLogout={signOut}>
      <div className="space-y-6">
        <KpiCards {...kpiStats} />

        <AlertsFilter
          filters={filters}
          symbols={symbols}
          onFilterChange={handleFilterChange}
        />

        {alertsLoading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">Loading alerts...</p>
          </div>
        ) : (
          <>
            <AlertsTable
              data={alerts}
              sorting={sorting}
              onSortingChange={setSorting}
            />
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
              onLimitChange={handleLimitChange}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
