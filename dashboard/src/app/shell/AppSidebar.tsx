import { NavLink, useLocation, useMatch } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  ScrollText,
  LogOut,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresSuperUser?: boolean;
  children?: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

const TIMELINE_NAV: NavItem[] = [
  { to: '/timeline', label: 'Timeline', icon: CalendarDays },
];

const DASHBOARD_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ...TIMELINE_NAV,
];

const ADMIN_NAV: NavItem[] = [
  {
    to: '/admin',
    label: 'Administration',
    icon: Shield,
    requiresSuperUser: true,
    children: [
      { to: '/admin/users', label: 'Benutzer & Zugänge', icon: Users },
      { to: '/admin/sessions', label: 'Sessions', icon: ScrollText },
    ],
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const adminMatch = useMatch('/admin/*');
  const { theme, setTheme } = useTheme();
  const [adminOpen, setAdminOpen] = useState(
    () => location.pathname.startsWith('/admin') || location.pathname === '/users',
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const isSuperUser = Boolean(user?.superUser) === true;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const avatarUrl =
    (user as { avatarUrl?: string | null })?.avatarUrl ??
    (user as { avatar_url?: string | null })?.avatar_url ??
    null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <Brand
            variant="mark"
            className="shrink-0 group-data-[collapsible=icon]:size-7"
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <Brand variant="wordmark" className="-ml-0.5" />
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Übersicht</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(isSuperUser ? DASHBOARD_NAV : TIMELINE_NAV).map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.to ||
                  location.pathname.startsWith(item.to + '/');
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <NavLink to={item.to}>
                        <Icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperUser && (
          <SidebarGroup>
            <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.to === '/admin'
                      ? Boolean(adminMatch)
                      : location.pathname === item.to ||
                        location.pathname.startsWith(item.to + '/');

                  if (item.children) {
                    return (
                      <Collapsible
                        key={item.to}
                        asChild
                        open={adminOpen}
                        onOpenChange={setAdminOpen}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              isActive={isActive}
                              tooltip={item.label}
                            >
                              <Icon />
                              <span>{item.label}</span>
                              <ChevronRight
                                className={cn(
                                  'ml-auto transition-transform',
                                  adminOpen && 'rotate-90',
                                )}
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.children.map((sub) => {
                                const SubIcon = sub.icon;
                                const subActive =
                                  sub.to === '/admin/users'
                                    ? location.pathname === '/admin/users'
                                    : location.pathname === sub.to;
                                return (
                                  <SidebarMenuSubItem key={sub.to}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={subActive}
                                    >
                                      <NavLink to={sub.to}>
                                        <SubIcon />
                                        <span>{sub.label}</span>
                                      </NavLink>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <NavLink to={item.to}>
                          <Icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Collapsible open={profileOpen} onOpenChange={setProfileOpen}>
              {profileOpen && (
                <div className="mb-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {user?.email}
                  </div>
                  <div className="-mx-0 my-1 h-px bg-border group-data-[collapsible=icon]:hidden" />
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/profile'); }}
                    className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:justify-center"
                  >
                    <UserIcon className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Profil</span>
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                    className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:justify-center"
                  >
                    <Settings className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Einstellungen</span>
                  </button>
                  <Collapsible open={themeOpen} onOpenChange={setThemeOpen}>
                    <CollapsibleTrigger className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:justify-center">
                      {theme === 'dark' ? <Moon className="size-4 shrink-0" /> : theme === 'light' ? <Sun className="size-4 shrink-0" /> : <Monitor className="size-4 shrink-0" />}
                      <span className="group-data-[collapsible=icon]:hidden">
                        Theme: {theme === 'dark' ? 'Dunkel' : theme === 'light' ? 'Hell' : 'System'}
                      </span>
                      <ChevronRight className={cn('ml-auto size-3 transition-transform group-data-[collapsible=icon]:hidden', themeOpen && 'rotate-90')} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-2 border-l pl-2">
                        <button onClick={() => setTheme('light')} className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                          <Sun className="size-4 shrink-0" /> <span className="group-data-[collapsible=icon]:hidden">Hell</span>
                        </button>
                        <button onClick={() => setTheme('dark')} className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                          <Moon className="size-4 shrink-0" /> <span className="group-data-[collapsible=icon]:hidden">Dunkel</span>
                        </button>
                        <button onClick={() => setTheme('system')} className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                          <Monitor className="size-4 shrink-0" /> <span className="group-data-[collapsible=icon]:hidden">System</span>
                        </button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="-mx-0 my-1 h-px bg-border" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 hover:text-destructive group-data-[collapsible=icon]:justify-center"
                  >
                    <LogOut className="size-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Abmelden</span>
                  </button>
                </div>
              )}
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  title={user?.name ? `${user.name} – Profil` : 'Profil'}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center!"
                >
                  <Avatar className="size-7 shrink-0 rounded-md group-data-[collapsible=icon]:size-8">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.name} />}
                    <AvatarFallback className="rounded-md text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{user?.name ?? 'User'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <ChevronUp className={cn('ml-auto size-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden', !profileOpen && 'rotate-180')} />
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </Collapsible>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
