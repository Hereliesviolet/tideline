import { useLocation, Link } from 'react-router-dom';
import { Search, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AppTopbarProps {
  onCommandOpen: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/overview': 'Dashboard',
  '/timeline': 'Timeline',
  '/users': 'Dashboard-Zugänge',
  '/admin': 'Administration',
  '/admin/users': 'Benutzer & Zugänge',
  '/admin/sessions': 'Sessions',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

function buildCrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { to: string; label: string }[] = [];
  let path = '';
  for (const seg of segments) {
    path += '/' + seg;
    const label = ROUTE_TITLES[path] ?? seg.replace(/^\w/, (c) => c.toUpperCase());
    crumbs.push({ to: path, label });
  }
  return crumbs;
}

export function AppTopbar({ onCommandOpen }: AppTopbarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const homePath = Boolean(user?.superUser) === true ? '/dashboard' : '/timeline';
  const { theme, resolvedTheme, setTheme } = useTheme();
  const crumbs = buildCrumbs(location.pathname);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.platform));
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-12 w-full shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex w-full min-w-0 items-center gap-2 px-3">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mr-2 h-4 shrink-0" />
        <Breadcrumb className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="shrink-0">
              <BreadcrumbLink asChild>
                <Link to={homePath}>Capacity Timeline</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {crumbs.map((c, idx) => (
              <span key={c.to} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0 shrink">
                  {idx === crumbs.length - 1 ? (
                    <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.to} className="truncate">
                        {c.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-muted-foreground"
            onClick={onCommandOpen}
          >
            <Search className="size-3.5" />
            <span className="hidden md:inline">Schnellsuche…</span>
            <kbd className="ml-2 hidden items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:inline-flex">
              {isMac ? '⌘' : 'Ctrl'}K
            </kbd>
          </Button>

          <ThemeMenu
            theme={theme}
            resolvedTheme={resolvedTheme}
            setTheme={setTheme}
          />
        </div>
      </div>
    </header>
  );
}

interface ThemeMenuProps {
  theme: string | undefined;
  resolvedTheme: string | undefined;
  setTheme: (t: string) => void;
}

function ThemeMenu({ theme, resolvedTheme, setTheme }: ThemeMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { value: string; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Hell', Icon: Sun },
    { value: 'dark', label: 'Dunkel', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Theme wählen"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Theme</div>
          <div className="-mx-1 my-1 h-px bg-border" />
          {items.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
                theme === value
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
