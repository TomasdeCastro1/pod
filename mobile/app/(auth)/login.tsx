import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { Body, Button, ErrorText, Field, FormScreen, Title } from '../../src/components/ui';
import { isPlausibleEmail, normalizeEmail } from '../../src/state/session';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const addr = normalizeEmail(email);
    if (!isPlausibleEmail(addr)) {
      setError('Revisá el email, parece que está incompleto.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.auth.requestCode(addr);
      router.push({ pathname: '/(auth)/codigo', params: { email: addr } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Title>Ingresá</Title>
      <Body>Escribí tu email y te mandamos un código para entrar. No hace falta contraseña.</Body>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="nombre@empresa.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        onSubmitEditing={submit}
        returnKeyType="send"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Recibir código" onPress={submit} loading={loading} />
    </FormScreen>
  );
}
