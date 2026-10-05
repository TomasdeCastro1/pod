import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { api, getApiBaseUrl } from '../../../src/api/client';
import { errorMessage } from '../../../src/api/errorMessage';
import { useAuth } from '../../../src/auth/AuthProvider';
import { CompanyList } from '../../../src/components/CompanyList';
import { Button, ErrorText, Field } from '../../../src/components/ui';
import { Card, Divider, Page, Row, SectionTitle } from '../../../src/profile/ui';

export default function PerfilScreen() {
  const router = useRouter();
  const { user, companies, activeCompany, setActiveCompanyId, setUser, signOut } = useAuth();
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmed = nombre.trim();
  const dirty = trimmed.length > 0 && trimmed !== (user?.nombre ?? '');

  async function saveName() {
    setSaving(true);
    setError('');
    try {
      const me = await api.me.update(trimmed);
      setUser(me.user);
      setNombre(me.user.nombre ?? '');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Cerrar sesión', '¿Querés cerrar la sesión en este celular?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const openLegal = (path: string) => void Linking.openURL(`${getApiBaseUrl()}${path}`);

  return (
    <Page>
      <SectionTitle>Usuario</SectionTitle>
      <Field
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Tu nombre"
        autoCapitalize="words"
      />
      <Field label="Email" value={user?.email ?? ''} editable={false} />
      <ErrorText>{error}</ErrorText>
      {dirty ? <Button title="Guardar nombre" onPress={saveName} loading={saving} /> : null}

      <SectionTitle>Mis empresas</SectionTitle>
      <Card>
        <CompanyList
          companies={companies}
          activeId={activeCompany?.id ?? null}
          onSelect={(c) => setActiveCompanyId(c.id)}
        />
      </Card>
      <Button
        title="Agregar empresa"
        variant="secondary"
        onPress={() => router.push({ pathname: '/perfil/agregar', params: { modo: 'crear' } })}
      />
      <Button
        title="Unirme con código"
        variant="secondary"
        onPress={() => router.push({ pathname: '/perfil/agregar', params: { modo: 'unirme' } })}
      />

      {companies.length > 0 ? (
        <>
          <SectionTitle>Configuración de empresa</SectionTitle>
          <Card>
            {companies.map((c) => (
              <Row
                key={c.id}
                title={c.nombre}
                subtitle="Datos, miembros, campos y uso"
                chevron
                onPress={() =>
                  router.push({ pathname: '/perfil/empresa/[id]', params: { id: c.id } })
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Cuenta</SectionTitle>
      <Button title="Cerrar sesión" variant="secondary" onPress={confirmSignOut} />
      {/* TODO(T6.2): la lógica de eliminar cuenta la hace T6.2; por ahora el botón queda deshabilitado. */}
      <Button title="Eliminar cuenta" variant="link" disabled onPress={() => {}} />

      <Card>
        <Row
          title="Política de privacidad"
          chevron
          onPress={() => openLegal('/legal/privacidad')}
        />
        <Divider />
        <Row title="Términos de uso" chevron onPress={() => openLegal('/legal/terminos')} />
      </Card>
    </Page>
  );
}
