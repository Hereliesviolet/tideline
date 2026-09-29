import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  Shield,
  ScrollText,
  Settings,
  User as UserIcon,
  Users,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useUsers } from '@/hooks/queries';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { setTheme } = useTheme();
  const isSuperUser = Boolean(user?.superUser) === true;
  const { data: users = [] } = useUsers(isSuperUser);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tippe einen Befehl oder suche…" />
      <CommandList>
        <CommandEmpty>Keine Treffer.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {isSuperUser && (
            <CommandItem onSelect={() => go('/dashboard')}>
              <LayoutDashboard /> Dashboard
            </CommandItem>
          )}
          <CommandItem onSelect={() => go('/timeline')}>
            <CalendarDays /> Timeline
          </CommandItem>
          <CommandItem onSelect={() => go('/profile')}>
            <UserIcon /> Profil
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')}>
            <Settings /> Einstellungen
          </CommandItem>
        </CommandGroup>

        {isSuperUser && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              <CommandItem onSelect={() => go('/admin/users')}>
                <Shield /> Benutzer & Zugänge
              </CommandItem>
              <CommandItem onSelect={() => go('/admin/sessions')}>
                <ScrollText /> Sessions
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {isSuperUser && users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Mitarbeiter (öffnet Timeline)">
              {users.slice(0, 8).map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.displayName ?? `${u.firstname} ${u.lastname}`} ${u.email}`}
                  onSelect={() => go(`/timeline?user=${u.id}`)}
                  className="gap-2"
                >
                  <UserIcon className="size-4 text-muted-foreground" />
                  <span>{u.displayName ?? `${u.firstname} ${u.lastname}`}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {u.unitName}
                  </span>
                </CommandItem>
              ))}
              {users.length > 8 && (
                <CommandItem
                  value="alle mitarbeiter"
                  onSelect={() => go('/admin/users')}
                  className="gap-2 text-muted-foreground"
                >
                  <Users className="size-4" />
                  <span>Alle Mitarbeiter zeigen…</span>
                  <span className="ml-auto text-xs">{users.length}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => {
              setTheme('light');
              onOpenChange(false);
            }}
          >
            <Sun /> Hell
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme('dark');
              onOpenChange(false);
            }}
          >
            <Moon /> Dunkel
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme('system');
              onOpenChange(false);
            }}
          >
            <Monitor /> System
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Konto">
          <CommandItem
            onSelect={async () => {
              await logout();
              onOpenChange(false);
              navigate('/login');
            }}
          >
            <LogOut /> Abmelden
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
