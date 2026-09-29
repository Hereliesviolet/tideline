import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <AppTopbar onCommandOpen={() => setCommandOpen(true)} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </SidebarProvider>
    </>
  );
}
