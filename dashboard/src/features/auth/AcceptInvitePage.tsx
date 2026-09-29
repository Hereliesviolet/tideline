import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Path } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { acceptInvite } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { setFormValuesFromNativeForm } from '@/lib/syncNativeFormInputs';
import { useNativeAutofillSync } from '@/hooks/useNativeAutofillSync';
import { Spinner } from '@/components/ui/spinner';

const inviteSchema = z
  .object({
    password: z.string().min(8, 'Mindestens 8 Zeichen.'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwörter stimmen nicht überein.',
  });

type InviteValues = z.infer<typeof inviteSchema>;

const INVITE_FORM_ID = 'accept-invite-form';
const INVITE_FIELD_PATHS: Path<InviteValues>[] = ['password', 'confirm'];

const AUTH_BG_STYLE: React.CSSProperties = {
  backgroundImage: 'linear-gradient(135deg, oklch(0.16 0.01 260) 0%, oklch(0.22 0.02 260) 55%, oklch(0.14 0.01 260) 100%)',
};

const AUTH_INPUT_CLS =
  'border-white/15 bg-white/5 text-zinc-50 placeholder:text-zinc-500 focus-visible:ring-zinc-400/50';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-zinc-950 p-4"
      style={AUTH_BG_STYLE}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/28" aria-hidden />
      <Card className="relative z-10 w-full max-w-md border border-white/10 bg-zinc-950/75 text-zinc-50 shadow-2xl backdrop-blur-md">
        {children}
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onSubmit',
  });

  useNativeAutofillSync(INVITE_FORM_ID, INVITE_FIELD_PATHS, form.setValue);

  const submitInvite = form.handleSubmit(async (values) => {
    if (!token) return;
    setError(null);
    try {
      await acceptInvite(token, values.password);
      setSuccess(true);
      toast.success('Passwort gesetzt — du wirst weitergeleitet.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Setzen des Passworts';
      setError(message);
    }
  });

  function onInviteFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormValuesFromNativeForm(e.currentTarget, INVITE_FIELD_PATHS, form.setValue);
    void submitInvite();
  }

  if (!token) {
    return (
      <AuthShell>
        <CardHeader>
          <CardTitle className="text-2xl text-zinc-50">Ungültiger Link</CardTitle>
          <CardDescription className="text-zinc-300">
            Bitte verwende den Link aus deiner Einladungs-E-Mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert
            variant="destructive"
            className="border-red-500/40 bg-red-950/50 text-red-100 [&_svg]:text-red-200"
          >
            <AlertTitle>Kein Einladungs-Token gefunden</AlertTitle>
            <AlertDescription>Der Link sollte einen Token-Parameter enthalten.</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => navigate('/login')}
            variant="outline"
            className="w-full border-white/20 bg-white/5 text-zinc-50 hover:bg-white/10"
          >
            Zur Anmeldung
          </Button>
        </CardFooter>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-zinc-50" />
          <CardTitle className="text-zinc-50">Passwort gesetzt</CardTitle>
          <CardDescription className="text-zinc-300">
            Du wirst zur Anmeldung weitergeleitet…
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center border-t border-white/10 bg-black/20 px-6 py-3 text-xs text-zinc-400">
          Capacity Timeline
        </CardFooter>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <CardHeader>
        <CardTitle className="text-2xl text-zinc-50">Einladung akzeptieren</CardTitle>
        <CardDescription className="text-zinc-300">
          Lege dein persönliches Passwort fest, um dich anzumelden.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert
            variant="destructive"
            className="mb-4 border-red-500/40 bg-red-950/50 text-red-100 [&_svg]:text-red-200"
          >
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form id={INVITE_FORM_ID} onSubmit={onInviteFormSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.password || undefined}>
              <FieldLabel htmlFor="password" className="text-zinc-200">
                Neues Passwort
              </FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.password || undefined}
                className={AUTH_INPUT_CLS}
                {...form.register('password')}
              />
              <FieldDescription className="text-zinc-400">Mindestens 8 Zeichen.</FieldDescription>
              <FieldError
                errors={form.formState.errors.password ? [form.formState.errors.password] : []}
              />
            </Field>

            <Field data-invalid={!!form.formState.errors.confirm || undefined}>
              <FieldLabel htmlFor="confirm" className="text-zinc-200">
                Passwort bestätigen
              </FieldLabel>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.confirm || undefined}
                className={AUTH_INPUT_CLS}
                {...form.register('confirm')}
              />
              <FieldError
                errors={form.formState.errors.confirm ? [form.formState.errors.confirm] : []}
              />
            </Field>

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="mt-2 w-full bg-zinc-100 text-zinc-950 hover:bg-white"
            >
              {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
              Passwort setzen
            </Button>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-white/10 bg-black/20 px-6 py-3 text-xs text-zinc-400">
        Capacity Timeline
      </CardFooter>
    </AuthShell>
  );
}
