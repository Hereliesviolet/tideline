import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Path } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { login, verify2FA, resend2FA, getCurrentUser } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { setFormValuesFromNativeForm } from '@/lib/syncNativeFormInputs';
import { useNativeAutofillSync } from '@/hooks/useNativeAutofillSync';
import { Spinner } from '@/components/ui/spinner';

const loginSchema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  password: z.string().min(1, 'Passwort wird benötigt.'),
});

type LoginValues = z.infer<typeof loginSchema>;

const LOGIN_FORM_ID = 'login-form';
const LOGIN_FIELD_PATHS: Path<LoginValues>[] = ['email', 'password'];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState<'login' | 'verify'>('login');
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [emailForVerify, setEmailForVerify] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  useNativeAutofillSync(LOGIN_FORM_ID, LOGIN_FIELD_PATHS, form.setValue);

  const submitCredentials = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const response = await login(values.email, values.password);
      setPendingToken(response.pendingToken);
      setEmailForVerify(values.email);
      setStep('verify');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login fehlgeschlagen';
      setError(message);
    }
  });

  function onLoginFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormValuesFromNativeForm(e.currentTarget, LOGIN_FIELD_PATHS, form.setValue);
    void submitCredentials();
  }

  const handleVerify = async (otp: string) => {
    if (!pendingToken || otp.length !== 6) return;
    setError(null);
    setVerifying(true);
    try {
      const response = await verify2FA(pendingToken, otp);
      localStorage.setItem('auth_token', response.token);
      const fullUser = await getCurrentUser();
      setUser(fullUser);
      toast.success('Willkommen zurück!', { description: fullUser.name });
      navigate('/timeline');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code-Verifizierung fehlgeschlagen';
      setError(message);
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!pendingToken) return;
    setResending(true);
    setError(null);
    try {
      await resend2FA(pendingToken);
      toast.success('Neuer Code wurde versendet.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code konnte nicht erneut gesendet werden';
      setError(message);
    } finally {
      setResending(false);
    }
  };

  const goBack = () => {
    setStep('login');
    setCode('');
    setError(null);
    setPendingToken(null);
  };

  return (
    <div
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-zinc-950 p-4"
      style={{
        backgroundImage: 'linear-gradient(135deg, oklch(0.16 0.01 260) 0%, oklch(0.22 0.02 260) 55%, oklch(0.14 0.01 260) 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/28" aria-hidden />
      <Card className="relative z-10 w-full max-w-md border border-white/10 bg-zinc-950/75 text-zinc-50 shadow-2xl backdrop-blur-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl text-zinc-50">
              {step === 'login' ? 'Anmelden' : 'Bestätigungscode'}
            </CardTitle>
            {step === 'verify' && (
              <Button variant="ghost" size="icon-sm" onClick={goBack} aria-label="Zurück">
                <ArrowLeft />
              </Button>
            )}
          </div>
          <CardDescription className="text-zinc-300">
            {step === 'login'
              ? 'Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.'
              : `Wir haben einen 6-stelligen Code an ${emailForVerify} gesendet.`}
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

          {step === 'login' ? (
            <form id={LOGIN_FORM_ID} onSubmit={onLoginFormSubmit} noValidate>
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.email || undefined}>
                  <FieldLabel htmlFor="email" className="text-zinc-200">
                    E-Mail
                  </FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={!!form.formState.errors.email || undefined}
                    className="border-white/15 bg-white/5 text-zinc-50 placeholder:text-zinc-500 focus-visible:ring-zinc-400/50"
                    {...form.register('email')}
                  />
                  <FieldError errors={form.formState.errors.email ? [form.formState.errors.email] : []} />
                </Field>

                <Field data-invalid={!!form.formState.errors.password || undefined}>
                  <FieldLabel htmlFor="password" className="text-zinc-200">
                    Passwort
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={!!form.formState.errors.password || undefined}
                    className="border-white/15 bg-white/5 text-zinc-50 placeholder:text-zinc-500 focus-visible:ring-zinc-400/50"
                    {...form.register('password')}
                  />
                  <FieldError errors={form.formState.errors.password ? [form.formState.errors.password] : []} />
                </Field>

                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="mt-2 w-full bg-zinc-100 text-zinc-950 hover:bg-white"
                >
                  {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
                  Anmelden
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="otp" className="sr-only">
                  6-stelliger Code
                </FieldLabel>
                <InputOTP
                  id="otp"
                  maxLength={6}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    if (v.length === 6) handleVerify(v);
                  }}
                  disabled={verifying}
                  containerClassName="justify-center [&_[data-slot=input-otp-slot]]:border-white/20 [&_[data-slot=input-otp-slot]]:bg-white/10 [&_[data-slot=input-otp-slot]]:text-zinc-50"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <FieldDescription className="text-center text-zinc-400">
                  Der Code ist 10 Minuten gültig.
                </FieldDescription>
              </Field>

              <div className="flex items-center justify-center text-sm">
                {verifying ? (
                  <span className="inline-flex items-center gap-2 text-zinc-400">
                    <Loader2 className="size-3.5 animate-spin" /> Wird geprüft…
                  </span>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleResend}
                    disabled={resending}
                    className="h-auto p-0"
                  >
                    {resending ? (
                      <>
                        <Spinner data-icon="inline-start" /> Wird gesendet…
                      </>
                    ) : (
                      <>
                        <Mail data-icon="inline-start" /> Code erneut senden
                      </>
                    )}
                  </Button>
                )}
              </div>
            </FieldGroup>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-white/10 bg-black/20 px-6 py-3 text-xs text-zinc-400">
          Capacity Timeline
        </CardFooter>
      </Card>
    </div>
  );
}
