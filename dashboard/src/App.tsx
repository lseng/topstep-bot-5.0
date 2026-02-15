import { useState, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { DashboardLayout } from '@dashboard/components/DashboardLayout';
import { LoginPage } from '@dashboard/components/LoginPage';
import { KpiCards } from '@dashboard/components/KpiCards';
import { AlertsFilter, type FilterState } from '@dashboard/components/AlertsFilter';
import { SymbolFilter } from '@dashboard/components/SymbolFilter';
import { AlertsTable } from '@dashboard/components/AlertsTable';
import { PositionsTable } from '@dashboard/components/PositionsTable';
import { TradeLogTable } from '@dashboard/components/TradeLogTable';
import { RawEventsTable } from '@dashboard/components/RawEventsTable';
import { Pagination } from '@dashboard/components/Pagination';
import { useAuth } from '@dashboard/hooks/useAuth';
import { useAlerts } from '@dashboard/hooks/useAlerts';
import { usePositions } from '@dashboard/hooks/usePositions';
import { useTradeLog } from '@dashboard/hooks/useTradeLog';
import { useSfxAlgoAlerts } from '@dashboard/hooks/useSfxAlgoAlerts';
import { useInformationalEvents } from '@dashboard/hooks/useInformationalEvents';
import { useRealtimeAlerts } from '@dashboard/hooks/useRealtimeAlerts';
import { useRealtimePositions } from '@dashboard/hooks/useRealtimePositions';
import { useRealtimeSfxAlgo } from '@dashboard/hooks/useRealtimeSfxAlgo';
import { useRealtimeInformational } from '@dashboard/hooks/useRealtimeInformational';

type TabId = 'alerts' | 'positions' | 'trades' | 'sfx-algo' | 'informational';

export function App() {
  const { user, isLoading: authLoading, signIn, signOut } = useAuth();
  const { isConnected: alertsConnected } = useRealtimeAlerts();
  const { isConnected: positionsConnected } = useRealtimePositions();
  useRealtimeSfxAlgo();
  useRealtimeInformational();
  const isConnected = alertsConnected || positionsConnected;

  const [activeTab, setActiveTab] = useState<TabId>('alerts');

  // Alerts state
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsLimit, setAlertsLimit] = useState(25);
  const [alertsSorting, setAlertsSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [filters, setFilters] = useState<FilterState>({
    symbol: '',
    action: '',
    status: '',
    from: '',
    to: '',
    name: '',
  });

  // Positions state
  const [positionsPage, setPositionsPage] = useState(1);
  const [positionsLimit, setPositionsLimit] = useState(25);
  const [positionsSorting, setPositionsSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [positionsSymbolFilter, setPositionsSymbolFilter] = useState('');

  // Trades state
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesLimit, setTradesLimit] = useState(25);
  const [tradesSorting, setTradesSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [tradesSymbolFilter, setTradesSymbolFilter] = useState('');

  // SFX Algo state
  const [sfxAlgoPage, setSfxAlgoPage] = useState(1);
  const [sfxAlgoLimit, setSfxAlgoLimit] = useState(25);
  const [sfxAlgoSorting, setSfxAlgoSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);

  // Informational state
  const [infoPage, setInfoPage] = useState(1);
  const [infoLimit, setInfoLimit] = useState(25);
  const [infoSorting, setInfoSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);

  const alertsSortColumn = alertsSorting[0]?.id ?? 'created_at';
  const alertsSortOrder = alertsSorting[0]?.desc ? 'desc' : 'asc';
  const positionsSortColumn = positionsSorting[0]?.id ?? 'created_at';
  const positionsSortOrder = positionsSorting[0]?.desc ? 'desc' : 'asc';
  const tradesSortColumn = tradesSorting[0]?.id ?? 'created_at';
  const tradesSortOrder = tradesSorting[0]?.desc ? 'desc' : 'asc';
  const sfxAlgoSortColumn = sfxAlgoSorting[0]?.id ?? 'created_at';
  const sfxAlgoSortOrder = sfxAlgoSorting[0]?.desc ? 'desc' : 'asc';
  const infoSortColumn = infoSorting[0]?.id ?? 'created_at';
  const infoSortOrder = infoSorting[0]?.desc ? 'desc' : 'asc';

  const { data: alertsData, isLoading: alertsLoading } = useAlerts({
    page: alertsPage,
    limit: alertsLimit,
    symbol: filters.symbol || undefined,
    action: filters.action || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    name: filters.name || undefined,
    sort: alertsSortColumn,
    order: alertsSortOrder,
  });

  const { data: positionsData, isLoading: positionsLoading } = usePositions({
    page: positionsPage,
    limit: positionsLimit,
    symbol: positionsSymbolFilter || undefined,
    sort: positionsSortColumn,
    order: positionsSortOrder,
  });

  const { data: tradesData, isLoading: tradesLoading } = useTradeLog({
    page: tradesPage,
    limit: tradesLimit,
    symbol: tradesSymbolFilter || undefined,
    sort: tradesSortColumn,
    order: tradesSortOrder,
  });

  const { data: sfxAlgoData, isLoading: sfxAlgoLoading } = useSfxAlgoAlerts({
    page: sfxAlgoPage,
    limit: sfxAlgoLimit,
    sort: sfxAlgoSortColumn,
    order: sfxAlgoSortOrder,
  });

  const { data: infoData, isLoading: infoLoading } = useInformationalEvents({
    page: infoPage,
    limit: infoLimit,
    sort: infoSortColumn,
    order: infoSortOrder,
  });

  const alerts = alertsData?.data ?? [];
  const alertsPagination = alertsData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const positions = positionsData?.data ?? [];
  const positionsPagination = positionsData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const trades = tradesData?.data ?? [];
  const tradesPagination = tradesData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const sfxAlgoAlerts = sfxAlgoData?.data ?? [];
  const sfxAlgoPagination = sfxAlgoData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const infoEvents = infoData?.data ?? [];
  const infoPagination = infoData?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };

  const symbols = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach((a) => set.add(a.symbol));
    positions.forEach((p) => set.add(p.symbol));
    trades.forEach((t) => set.add(t.symbol));
    return Array.from(set).sort();
  }, [alerts, positions, trades]);

  const kpiStats = useMemo(() => {
    const total = alertsPagination.total;
    const executed = alerts.filter((a) => a.status === 'executed').length;
    const failed = alerts.filter((a) => a.status === 'failed').length;
    const successRate = total > 0 ? (executed / total) * 100 : 0;
    const lastAlert = alerts.length > 0 ? alerts[0].created_at : null;

    const openPositions = positions.filter((p) =>
      !['closed', 'cancelled'].includes(p.state),
    ).length;
    const totalPnl = trades.reduce((sum, t) => sum + t.net_pnl, 0);

    // Per-symbol P&L breakdown
    const perSymbolPnl: Record<string, number> = {};
    for (const t of trades) {
      perSymbolPnl[t.symbol] = (perSymbolPnl[t.symbol] ?? 0) + t.net_pnl;
    }

    return {
      totalAlerts: total,
      successRate,
      failedCount: failed,
      lastAlertTime: lastAlert,
      openPositions,
      totalPnl,
      perSymbolPnl,
    };
  }, [alerts, alertsPagination.total, positions, trades]);

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
    setAlertsPage(1);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'alerts', label: 'Alerts' },
    { id: 'positions', label: 'Positions' },
    { id: 'trades', label: 'Trade Log' },
    { id: 'sfx-algo', label: 'SFX Algo' },
    { id: 'informational', label: 'Informational' },
  ];

  return (
    <DashboardLayout isConnected={isConnected} onLogout={signOut}>
      <div className="space-y-6">
        <KpiCards {...kpiStats} />

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alerts Tab */}
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
                  sorting={alertsSorting}
                  onSortingChange={setAlertsSorting}
                />
                <Pagination
                  page={alertsPagination.page}
                  totalPages={alertsPagination.totalPages}
                  total={alertsPagination.total}
                  limit={alertsPagination.limit}
                  onPageChange={setAlertsPage}
                  onLimitChange={(l) => { setAlertsLimit(l); setAlertsPage(1); }}
                />
              </>
            )}
          </>
        )}

        {/* Positions Tab */}
        {activeTab === 'positions' && (
          <>
            <SymbolFilter
              value={positionsSymbolFilter}
              symbols={symbols}
              onChange={(v) => { setPositionsSymbolFilter(v); setPositionsPage(1); }}
            />
            {positionsLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading positions...</p>
              </div>
            ) : (
              <>
                <PositionsTable
                  data={positions}
                  sorting={positionsSorting}
                  onSortingChange={setPositionsSorting}
                />
                <Pagination
                  page={positionsPagination.page}
                  totalPages={positionsPagination.totalPages}
                  total={positionsPagination.total}
                  limit={positionsPagination.limit}
                  onPageChange={setPositionsPage}
                  onLimitChange={(l) => { setPositionsLimit(l); setPositionsPage(1); }}
                />
              </>
            )}
          </>
        )}

        {/* Trade Log Tab */}
        {activeTab === 'trades' && (
          <>
            <SymbolFilter
              value={tradesSymbolFilter}
              symbols={symbols}
              onChange={(v) => { setTradesSymbolFilter(v); setTradesPage(1); }}
            />
            {tradesLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading trades...</p>
              </div>
            ) : (
              <>
                <TradeLogTable
                  data={trades}
                  sorting={tradesSorting}
                  onSortingChange={setTradesSorting}
                />
                <Pagination
                  page={tradesPagination.page}
                  totalPages={tradesPagination.totalPages}
                  total={tradesPagination.total}
                  limit={tradesPagination.limit}
                  onPageChange={setTradesPage}
                  onLimitChange={(l) => { setTradesLimit(l); setTradesPage(1); }}
                />
              </>
            )}
          </>
        )}

        {/* SFX Algo Tab */}
        {activeTab === 'sfx-algo' && (
          <>
            {sfxAlgoLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading SFX Algo alerts...</p>
              </div>
            ) : (
              <>
                <RawEventsTable
                  data={sfxAlgoAlerts}
                  sorting={sfxAlgoSorting}
                  onSortingChange={setSfxAlgoSorting}
                  emptyMessage="No SFX Algo alerts found."
                />
                <Pagination
                  page={sfxAlgoPagination.page}
                  totalPages={sfxAlgoPagination.totalPages}
                  total={sfxAlgoPagination.total}
                  limit={sfxAlgoPagination.limit}
                  onPageChange={setSfxAlgoPage}
                  onLimitChange={(l) => { setSfxAlgoLimit(l); setSfxAlgoPage(1); }}
                />
              </>
            )}
          </>
        )}

        {/* Informational Tab */}
        {activeTab === 'informational' && (
          <>
            {infoLoading ? (
              <div className="h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Loading informational events...</p>
              </div>
            ) : (
              <>
                <RawEventsTable
                  data={infoEvents}
                  sorting={infoSorting}
                  onSortingChange={setInfoSorting}
                  emptyMessage="No informational events found."
                />
                <Pagination
                  page={infoPagination.page}
                  totalPages={infoPagination.totalPages}
                  total={infoPagination.total}
                  limit={infoPagination.limit}
                  onPageChange={setInfoPage}
                  onLimitChange={(l) => { setInfoLimit(l); setInfoPage(1); }}
                />
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
