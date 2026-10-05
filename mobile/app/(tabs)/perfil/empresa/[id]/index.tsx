import { isValidRut, normalizeRut, type Member, type Role } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, View } from 'react-native';
import { ApiError, api } from '../../../../../src/api/client';
import { errorMessage } from '../../../../../src/api/errorMessage';
import { useAuth } from '../../../../../src/auth/AuthProvider';
import { Button, ErrorText, Field } from '../../../../../src/components/ui';
import {
  ROLE_LABELS,
  companyPermissions,
  memberActions,
  memberDisplayName,
  memberErrorMessage,
} from '../../../../../src/profile/permissions';
import { Card, Divider, Page, Pill, Row, SectionTitle } from '../../../../../src/profile/ui';
import { colors } from '../../../../../src/theme';

export default function EmpresaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, companies, updateCompany, refresh } = useAuth();
  const mine = companies.find((c) => c.id === id);
  const perms = companyPermissions(mine?.role);

  const company = useQuery({
    queryKey: ['company', id],
    queryFn: async () => (await api.companies.list()).companies.find((c) => c.id === id) ?? null,
    enabled: !!id,
  });
  const members = useQuery({
    queryKey: ['members', id],
    queryFn: async () => (await api.companies.members(id)).members,
    enabled: !!id,
  });

  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [error, setError] = useState('');
  const [memberError, setMemberError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (company.data) {
      setNombre(company.data.nombre);
      setRut(company.data.rut);
    }
  }, [company.data]);

  if (!mine) {
    return (
      <Page>
        <Text style={{ color: colors.textMuted }}>Ya no sos parte de esta empresa.</Text>
      </Page>
    );
  }

  const rutOk = isValidRut(normalizeRut(rut));
  const dirty =
    !!company.data &&
    (nombre.trim() !== company.data.nombre || normalizeRut(rut) !== company.data.rut);

  async function saveData() {
    setSaving(true);
    setError('');
    try {
      const { company: c } = await api.companies.update(id, {
        nombre: nombre.trim(),
        rut: normalizeRut(rut),
      });
      updateCompany({ id: c.id, nombre: c.nombre, rut: c.rut, role: c.role });
      qc.setQueryData(['company', id], c);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function memberCall(fn: () => Promise<unknown>) {
    setBusy(true);
    setMemberError('');
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['members', id] });
    } catch (e) {
      setMemberError(
        memberErrorMessage(e instanceof ApiError ? e.code : undefined, errorMessage(e)),
      );
    } finally {
      setBusy(false);
    }
  }

  function changeRole(m: Member, role: Role) {
    const name = memberDisplayName(m);
    Alert.alert('Cambiar rol', `¿Cambiar a ${name} a ${ROLE_LABELS[role].toLowerCase()}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cambiar',
        onPress: () =>
          void memberCall(async () => {
            await api.companies.setMemberRole(id, m.id, role);
            if (m.id === user?.id) await refresh();
          }),
      },
    ]);
  }

  function remove(m: Member) {
    const self = m.id === user?.id;
    Alert.alert(
      self ? 'Salir de la empresa' : 'Quitar miembro',
      self
        ? '¿Querés salir de esta empresa? Dejás de ver sus comprobantes.'
        : `¿Quitar a ${memberDisplayName(m)} de la empresa? Deja de ver sus comprobantes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: self ? 'Salir' : 'Quitar',
          style: 'destructive',
          onPress: () =>
            void memberCall(async () => {
              await api.companies.removeMember(id, m.id);
              if (self) {
                await refresh();
                router.back();
              }
            }),
        },
      ],
    );
  }

  function regenerate() {
    Alert.alert(
      'Regenerar código',
      'El código actual deja de funcionar. Quienes ya son miembros no se ven afectados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Regenerar',
          onPress: () =>
            void memberCall(async () => {
              const { company: c } = await api.companies.regenerateInviteCode(id);
              qc.setQueryData(['company', id], c);
            }),
        },
      ],
    );
  }

  const code = company.data?.inviteCode;
  const go = (pathname: '/perfil/empresa/[id]/campos' | '/perfil/empresa/[id]/uso') =>
    router.push({ pathname, params: { id } });

  return (
    <Page>
      {!perms.canEditData ? (
        <Text style={{ color: colors.textMuted }}>
          Solo los administradores pueden editar la empresa. Vos ves la configuración.
        </Text>
      ) : null}

      <SectionTitle>Datos</SectionTitle>
      <Field
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        editable={perms.canEditData}
        autoCapitalize="words"
      />
      <Field
        label="RUT"
        value={rut}
        onChangeText={setRut}
        editable={perms.canEditData}
        keyboardType="number-pad"
        error={perms.canEditData && rut.length > 0 && !rutOk ? 'El RUT no es válido.' : undefined}
      />
      <ErrorText>{error}</ErrorText>
      {perms.canEditData && dirty ? (
        <Button
          title="Guardar datos"
          onPress={saveData}
          loading={saving}
          disabled={nombre.trim().length === 0 || !rutOk}
        />
      ) : null}

      <SectionTitle>Configuración</SectionTitle>
      <Card>
        <Row title="Campos a leer" chevron onPress={() => go('/perfil/empresa/[id]/campos')} />
        <Divider />
        <Row title="Uso y precio" chevron onPress={() => go('/perfil/empresa/[id]/uso')} />
      </Card>

      <SectionTitle>Código de invitación</SectionTitle>
      <Card>
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          {company.isLoading ? (
            <ActivityIndicator />
          ) : (
            <Text
              selectable
              accessibilityLabel={code ? `Código ${code.split('').join(' ')}` : undefined}
              style={{ fontSize: 32, fontWeight: '700', letterSpacing: 6, color: colors.text }}
            >
              {code ?? '------'}
            </Text>
          )}
        </View>
      </Card>
      {code ? (
        <Button
          title="Compartir"
          variant="secondary"
          onPress={() =>
            void Share.share({
              message: `Unite a ${mine.nombre} en la app con este código de invitación: ${code}`,
            })
          }
        />
      ) : null}
      {perms.canRegenerateCode ? (
        <Button title="Regenerar" variant="link" onPress={regenerate} disabled={busy} />
      ) : null}

      <SectionTitle>Miembros</SectionTitle>
      <ErrorText>{memberError}</ErrorText>
      {members.isLoading ? <ActivityIndicator /> : null}
      {members.error ? <ErrorText>{errorMessage(members.error)}</ErrorText> : null}
      <Card>
        {(members.data ?? []).map((m, i) => {
          const a = memberActions(mine.role, m);
          return (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                title={memberDisplayName(m) + (m.id === user?.id ? ' (vos)' : '')}
                subtitle={m.nombre ? m.email : undefined}
                right={<Pill text={ROLE_LABELS[m.role]} />}
              />
              {a.canChangeRole || a.canRemove ? (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                  {a.canChangeRole ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        title={a.nextRole === 'admin' ? 'Hacer administrador' : 'Hacer miembro'}
                        variant="link"
                        disabled={busy}
                        onPress={() => changeRole(m, a.nextRole)}
                      />
                    </View>
                  ) : null}
                  {a.canRemove ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        title={m.id === user?.id ? 'Salir' : 'Quitar'}
                        variant="link"
                        disabled={busy}
                        onPress={() => remove(m)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
    </Page>
  );
}
