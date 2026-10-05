import { isValidRut, normalizeRut } from '@app/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../../src/api/client';
import { errorMessage } from '../../../src/api/errorMessage';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Body, Button, ErrorText, Field } from '../../../src/components/ui';
import { normalizeInviteCode } from '../../../src/state/session';
import { Page } from '../../../src/profile/ui';

/** Agregar una empresa (nombre + RUT) o unirse con código, desde el Perfil. */
export default function AgregarEmpresaScreen() {
  const { modo } = useLocalSearchParams<{ modo?: string }>();
  const router = useRouter();
  const { addCompany } = useAuth();
  const joining = modo === 'unirme';
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rutTouched = rut.trim().length > 0;
  const rutOk = isValidRut(normalizeRut(rut));

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const { company } = joining
        ? await api.companies.join(code)
        : await api.companies.create(nombre.trim(), normalizeRut(rut));
      addCompany(company); // queda como empresa activa
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (joining) {
    return (
      <Page>
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
        <Button title="Unirme" onPress={submit} disabled={code.length !== 6} loading={loading} />
      </Page>
    );
  }

  return (
    <Page>
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
        placeholder="12 dígitos, sin guiones"
        keyboardType="number-pad"
        error={rutTouched && !rutOk ? 'El RUT no es válido, revisá el último dígito.' : undefined}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Crear empresa"
        onPress={submit}
        disabled={nombre.trim().length === 0 || !rutOk}
        loading={loading}
      />
    </Page>
  );
}
