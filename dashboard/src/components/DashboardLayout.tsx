import type { ReactNode } from 'react';
import { Button } from '@dashboard/components/ui/button';
import { LogOut } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  isConnected: boolean;
  onLogout: () => void;
}

export function DashboardLayout({
  children,
  isConnected,
  onLogout,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          TopstepX Bot Dashboard
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`size-2 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`}
            />
            <span className="text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
