import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { atomWithStorage } from 'jotai/utils';
import { useAtom } from 'jotai';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sun,
  Moon,
  Monitor,
  Settings as SettingsIcon,
  Languages,
  Activity as ActivityIcon,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Density = 'comfortable' | 'compact';

const densityAtom = atomWithStorage<Density>('capacity-timeline-density', 'comfortable');
const reduceMotionAtom = atomWithStorage<boolean>('capacity-timeline-reduce-motion', false);
const localeAtom = atomWithStorage<'de' | 'en'>('capacity-timeline-locale', 'de');

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useAtom(densityAtom);
  const [reduceMotion, setReduceMotion] = useAtom(reduceMotionAtom);
  const [locale, setLocale] = useAtom(localeAtom);
  const [mounted, setMounted] = useState(false);
  const isSuperUser = Boolean(user?.superUser) === true;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    if (reduceMotion) {
      document.documentElement.style.setProperty('--motion-reduce', '1');
    } else {
      document.documentElement.style.removeProperty('--motion-reduce');
    }
  }, [density, reduceMotion]);

  const handleSyncTrigger = async () => {
    toast.info('Sync wird gestartet…');
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('MOCO-Sync angestoßen');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync fehlgeschlagen');
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SettingsIcon />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">
            Anpassungen am Dashboard für deine Sitzung.
          </p>
        </div>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">
            <Sun data-icon="inline-start" /> Darstellung
          </TabsTrigger>
          <TabsTrigger value="language">
            <Languages data-icon="inline-start" /> Sprache
          </TabsTrigger>
          <TabsTrigger value="diagnostics">
            <ActivityIcon data-icon="inline-start" /> Diagnose
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                Wähle, wie das Dashboard angezeigt werden soll.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={mounted ? (theme ?? 'system') : 'system'}
                onValueChange={(v) => setTheme(v)}
                className="grid gap-3 sm:grid-cols-3"
              >
                <Label
                  htmlFor="theme-light"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-4 hover:bg-muted transition-colors data-[checked=true]:border-primary data-[checked=true]:bg-primary/5"
                  data-checked={theme === 'light'}
                >
                  <RadioGroupItem value="light" id="theme-light" className="sr-only" />
                  <Sun className="size-5" />
                  <span className="text-sm font-medium">Hell</span>
                </Label>
                <Label
                  htmlFor="theme-dark"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-4 hover:bg-muted transition-colors data-[checked=true]:border-primary data-[checked=true]:bg-primary/5"
                  data-checked={theme === 'dark'}
                >
                  <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
                  <Moon className="size-5" />
                  <span className="text-sm font-medium">Dunkel</span>
                </Label>
                <Label
                  htmlFor="theme-system"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-4 hover:bg-muted transition-colors data-[checked=true]:border-primary data-[checked=true]:bg-primary/5"
                  data-checked={theme === 'system'}
                >
                  <RadioGroupItem value="system" id="theme-system" className="sr-only" />
                  <Monitor className="size-5" />
                  <span className="text-sm font-medium">System</span>
                </Label>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Density</CardTitle>
              <CardDescription>
                Kompakter Layout-Modus reduziert Abstände in Tabellen und Listen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToggleGroup
                type="single"
                value={density}
                onValueChange={(v) => v && setDensity(v as Density)}
                variant="outline"
              >
                <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
                <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <div>
                <CardTitle>Reduzierte Animationen</CardTitle>
                <CardDescription>
                  Reduziert Übergänge und Effekte für bessere Lesbarkeit.
                </CardDescription>
              </div>
              <Switch
                checked={reduceMotion}
                onCheckedChange={setReduceMotion}
                aria-label="Reduzierte Animationen"
              />
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="language" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sprache</CardTitle>
              <CardDescription>
                Aktuell ist nur Deutsch implementiert. Englisch ist vorbereitet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={locale} onValueChange={(v) => setLocale(v as 'de' | 'en')}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en" disabled>
                    English (in Vorbereitung)
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Versions-Info</CardTitle>
              <CardDescription>
                Build- und Laufzeit-Information dieses Dashboards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Frontend</dt>
                  <dd className="font-medium">Capacity Timeline</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">UI</dt>
                  <dd className="font-medium">shadcn/ui · Nova Theme</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Build-Mode</dt>
                  <dd>
                    <Badge variant="secondary">
                      {import.meta.env.MODE ?? 'production'}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Konto</dt>
                  <dd>{user?.email ?? '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {isSuperUser && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>MOCO-Sync</CardTitle>
                  <CardDescription>
                    Manueller Sync-Trigger für Super-User.
                  </CardDescription>
                </div>
                <Button onClick={handleSyncTrigger} variant="outline" size="sm">
                  <RefreshCw data-icon="inline-start" /> Sync starten
                </Button>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
