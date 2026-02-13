import { useState, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { DashboardLayout } from '@dashboard/components/DashboardLayout';
import { LoginPage } from '@dashboard/components/LoginPage';
import { KpiCards } from '@dashboard/components/KpiCards';
import { AlertsFilter, type FilterState } from '@dashboard/components/AlertsFilter';
import { AlertsTable } from '@dashboard/components/AlertsTable';
import { PositionsTable } from '@dashboard/components/PositionsTable';
import { TradeLogTable } from '@dashboard/components/TradeLogTable';
import { Pagination } from '@dashboard/components/Pagination';
import { useAuth } from '@dashboard/hooks/useAuth';
import { useAlerts } from '@dashboard/hooks/useAlerts';
import { usePositions } from '@dashboard/hooks/usePositions';
import { useTradeLog } from '@dashboard/hooks/useTradeLog';
import { useRealtimeAlerts } from '@dashboard/hooks/useRealtimeAlerts';
import { useRealtimePositions } from '@dashboard/hooks/useRealtimePositions';

type TabId = 'alerts' | 'positions' | 'trades';

export function App() {
  const { user, isLoading: authLoading, signIn, signOut } = useAuth();
  const { isConnected: alertsConnected } = useRealtimeAlerts();
  const { isConnected: positionsConnected } = useRealtimePositions();
  const isConnected = alertsConnected || positionsConnected;

  const [activeTab, setActiveTab] = useState<TabId>('alerts');

  // Alerts state
  const [alertPage, setAlertPage] = useState(1);
  const [alertLimit, setAlertLimit] = useState(25);
  const [alertSorting, setAlertSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [filters, setFilters] = useState<FilterState>({
    symbol: '',
    action: '',
    status: '',
    from: '',
    to: '',
  });

  const alertSortColumn = alertSorting[0]?.id ?? 'created_at';
  const alertSortOrder = alertSorting[0]?.desc ? 'desc' : 'asc';

  const { data: alertsData, isLoading: alertsLoading } = useAlerts({
    page: alertPage,
    limit: alertLimit,
    symbol: filters.symbol || undefined,
    action: filters.action || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: alertSortColumn,
    order: alertSortOrder,
  });

  // Positions state
  const [posPage, setPosPage] = useState(1);
  const [posLimit, setPosLimit] = useState(25);
  const [posSorting, setPosSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);

  const posSortColumn = posSorting[0]?.id ?? 'created_at';
  const posSortOrder = posSorting[0]?.desc ? 'desc' : 'asc';

  const { data: positionsData, isLoading: positionsLoading } = usePositions({
    page: posPage,
    limit: posLimit,
    sort: posSortColumn,
    order: posSortOrder,
  });

  // Trade log state
  const [tradePage, setTradePage] = useState(1);
  const [tradeLimit, setTradeLimit] = useState(25);
  const [tradeSorting, setTradeSorting] = useState<SortingState>([
    { id: 'exit_time', desc: true },
  ]);

  const tradeSortColumn = tradeSorting[0]?.id ?? 'exit_time';
  const tradeSortOrder = tradeSorting[0]?.desc ? 'desc' : 'asc';

  const { data: tradeLogData, isLoading: tradeLogLoading } = useTradeLog({
    page: tradePage,
    limit: tradeLimit,
    sort: tradeSortColumn,
    order: tradeSortOrder,
  });

  const alerts = alertsData?.data ?? [];
  const alertPagination = alertsData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const positions = positionsData?.data ?? [];
  const posPagination = positionsData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const trades = tradeLogData?.data ?? [];
  const tradePagination = tradeLogData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };

  const symbols = useMemo(() => {
    const set = new Set(alerts.map((a) => a.symbol));
    return Array.from(set).sort();
  }, [alerts]);

  const kpiStats = useMemo(() => {
    const total = alertPagination.total;
    const executed = alerts.filter((a) => a.status === 'executed').length;
    const failed = alerts.filter((a) => a.status === 'failed').length;
    const successRate = total > 0 ? (executed / total) * 100 : 0;
    const lastAlert = alerts.length > 0 ? alerts[0].created_at : null;
    const totalPnl = trades.reduce((sum, t) => sum + t.net_pnl, 0);
    const activePositions = positions.filter(
      (p) => p.state !== 'closed' && p.state !== 'cancelled',
    ).length;
    return {
      totalAlerts: total,
      successRate,
      failedCount: failed,
      lastAlertTime: lastAlert,
      totalPnl,
      activePositions,
    };
  }, [alerts, alertPagination.total, trades, positions]);

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
    setAlertPage(1);
  };

  const handleAlertLimitChange = (newLimit: number) => {
    setAlertLimit(newLimit);
    setAlertPage(1);
  };

  const handlePosLimitChange = (newLimit: number) => {
    setPosLimit(newLimit);
    setPosPage(1);
  };

  const handleTradeLimitChange = (newLimit: number) => {
    setTradeLimit(newLimit);
    setTradePage(1);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'alerts', label: 'Alerts' },
    { id: 'positions', label: 'Positions' },
    { id: 'trades', label: 'Trade Log' },
  ];

  return (
    <DashboardLayout isConnected={isConnected} onLogout={signOut}>
      <div className="space-y-6">
        <KpiCards {...kpiStats} />

        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'alerts' && (
          <>
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
                  sorting={alertSorting}
                  onSortingChange={setAlertSorting}
                />
                <Pagination
                  page={alertPagination.page}
                  totalPages={alertPagination.totalPages}
                  total={alertPagination.total}
                  limit={alertPagination.limit}
                  onPageChange={setAlertPage}
                  onLimitChange={handleAlertLimitChange}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'positions' && (
          <>
            {positionsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading positions...</p>
              </div>
            ) : (
              <>
                <PositionsTable
                  data={positions}
                  sorting={posSorting}
                  onSortingChange={setPosSorting}
                />
                <Pagination
                  page={posPagination.page}
                  totalPages={posPagination.totalPages}
                  total={posPagination.total}
                  limit={posPagination.limit}
                  onPageChange={setPosPage}
                  onLimitChange={handlePosLimitChange}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'trades' && (
          <>
            {tradeLogLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading trade log...</p>
              </div>
            ) : (
              <>
                <TradeLogTable
                  data={trades}
                  sorting={tradeSorting}
                  onSortingChange={setTradeSorting}
                />
                <Pagination
                  page={tradePagination.page}
                  totalPages={tradePagination.totalPages}
                  total={tradePagination.total}
                  limit={tradePagination.limit}
                  onPageChange={setTradePage}
                  onLimitChange={handleTradeLimitChange}
                />
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
