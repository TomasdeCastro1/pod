import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { useAuth } from '../../src/auth/AuthProvider';
import { Body, Button, ErrorText, Field, FormScreen, Title } from '../../src/components/ui';
import { decideStartRoute, normalizeOtp, resendSecondsLeft } from '../../src/state/session';

export default function CodeScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const wait = resendSecondsLeft(sentAt, now);

  async function verify(value: string) {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.verify(email, value);
      await signIn(res.token, res.user, res.companies);
      router.replace(decideStartRoute('signedIn', res.companies) ?? '/(tabs)/escanear');
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function onChange(text: string) {
    const next = normalizeOtp(text);
    setCode(next);
    if (next.length === 6) void verify(next);
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      await api.auth.requestCode(email);
      setSentAt(Date.now());
      setNow(Date.now());
      setInfo('Te mandamos un código nuevo.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormScreen>
      <Title>Poné el código</Title>
      <Body>Te lo mandamos a {email}. Son 6 números.</Body>
      <Field
        label="Código"
        value={code}
        onChangeText={onChange}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
      />
      <ErrorText>{error}</ErrorText>
      {info ? <Body>{info}</Body> : null}
      <Button
        title="Entrar"
        onPress={() => verify(code)}
        disabled={code.length !== 6}
        loading={loading}
      />
      <Button
        title={wait > 0 ? `Reenviar código (${wait} s)` : 'Reenviar código'}
        onPress={resend}
        disabled={wait > 0}
        variant="secondary"
      />
      <Button title="Cambiar email" onPress={() => router.back()} variant="link" />
    </FormScreen>
  );
}
