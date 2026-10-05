import { isValidRut, normalizeRut } from '@app/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { useAuth } from '../../src/auth/AuthProvider';
import { Body, Button, ErrorText, Field, FormScreen, Title } from '../../src/components/ui';
import { normalizeInviteCode } from '../../src/state/session';

type Mode = 'choose' | 'create' | 'join';

export default function CompanyScreen() {
  const router = useRouter();
  const { addCompany, signOut, companies } = useAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rutTouched = rut.trim().length > 0;
  const rutOk = isValidRut(normalizeRut(rut));

  function done(company: Parameters<typeof addCompany>[0]) {
    addCompany(company);
    router.replace('/(auth)/camara');
  }

  async function create() {
    setLoading(true);
    setError('');
    try {
      const { company } = await api.companies.create(nombre.trim(), normalizeRut(rut));
      done(company);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function join() {
    setLoading(true);
    setError('');
    try {
      const { company } = await api.companies.join(code);
      done(company);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'create') {
    return (
      <FormScreen>
        <Title>Crear empresa</Title>
        <Field
          label="Nombre de la empresa"
          value={nombre}
          onChangeText={setNombre}
          placeholder="Distribuidora Pérez"
          autoCapitalize="words"
        />
        <Field
          label="RUT"
          value={rut}
          onChangeText={setRut}
          placeholder="12 digitos, sin guiones"
          keyboardType="number-pad"
          error={rutTouched && !rutOk ? 'El RUT no es válido, revisá el último dígito.' : undefined}
        />
        <ErrorText>{error}</ErrorText>
        <Button
          title="Crear empresa"
          onPress={create}
          disabled={nombre.trim().length === 0 || !rutOk}
          loading={loading}
        />
        <Button title="Volver" onPress={() => setMode('choose')} variant="link" />
      </FormScreen>
    );
  }

  if (mode === 'join') {
    return (
      <FormScreen>
        <Title>Unirme con código</Title>
        <Body>Pedile el código de 6 caracteres a un administrador de tu empresa.</Body>
        <Field
          label="Código de invitación"
          value={code}
          onChangeText={(t) => setCode(normalizeInviteCode(t))}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Unirme" onPress={join} disabled={code.length !== 6} loading={loading} />
        <Button title="Volver" onPress={() => setMode('choose')} variant="link" />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Title>Tu empresa</Title>
      <Body>Para empezar, creá tu empresa o unite a una que ya existe.</Body>
      <Button title="Crear empresa" onPress={() => setMode('create')} />
      <Button title="Unirme con código" onPress={() => setMode('join')} variant="secondary" />
      {companies.length === 0 ? (
        <Button title="Salir" onPress={() => void signOut()} variant="link" />
      ) : null}
    </FormScreen>
  );
}
