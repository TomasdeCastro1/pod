import type { CompanyFieldsResponse } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../../../../../src/api/client';
import { errorMessage } from '../../../../../src/api/errorMessage';
import { useAuth } from '../../../../../src/auth/AuthProvider';
import { Button, ErrorText } from '../../../../../src/components/ui';
import {
  docTypesLabel,
  enabledOptionalKeys,
  fieldMode,
  formatOptionalPrice,
  formatPricePer1000,
  livePrice,
  sameSet,
  toSaveBody,
  toggleKey,
} from '../../../../../src/profile/fields';
import { companyPermissions } from '../../../../../src/profile/permissions';
import { Card, Divider, Page, Pill, SectionTitle } from '../../../../../src/profile/ui';
import { colors } from '../../../../../src/theme';

export default function CamposScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { companies } = useAuth();
  const canEdit = companyPermissions(companies.find((c) => c.id === id)?.role).canEditFields;

  const query = useQuery({
    queryKey: ['fields', id],
    queryFn: () => api.fields.get(id),
    enabled: !!id,
  });
  const data = query.data;

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Lo que dice el servidor es el punto de partida (y se vuelve a tomar tras guardar).
  useEffect(() => {
    if (data) setEnabled(enabledOptionalKeys(data.groups));
  }, [data]);

  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!data) {
    return (
      <Page>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
        <Button title="Reintentar" onPress={() => void query.refetch()} />
      </Page>
    );
  }

  const dirty = !sameSet(enabled, enabledOptionalKeys(data.groups));
  const price = livePrice(data.base_price, data.groups, enabled);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res: CompanyFieldsResponse = await api.fields.save(id, toSaveBody(enabled));
      qc.setQueryData(['fields', id], res); // el precio del servidor es la fuente de verdad
      setEnabled(enabledOptionalKeys(res.groups));
      void qc.invalidateQueries({ queryKey: ['usage', id] });
      Alert.alert(
        'Guardado',
        `Precio actual: ${formatPricePer1000(res.price_per_1000)}.\n\nEl nuevo precio aplica a los comprobantes que se escaneen desde ahora.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.priceBar} accessibilityRole="header">
        <Text style={styles.price}>Precio actual: {formatPricePer1000(price)}</Text>
      </View>
      <Page>
        {!canEdit ? (
          <Text style={{ color: colors.textMuted }}>
            Solo los administradores pueden cambiar los campos. Vos ves la configuración.
          </Text>
        ) : null}
        {data.groups.map((g) => (
          <View key={g.name} style={{ gap: 8 }}>
            <SectionTitle>{g.name}</SectionTitle>
            <Card>
              {g.fields.map((f, i) => {
                const mode = fieldMode(f, canEdit);
                const on = f.is_base || enabled.has(f.key);
                return (
                  <View key={f.key}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.field}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>{f.label}</Text>
                        <Text style={styles.sub}>
                          {docTypesLabel(f.doc_types)}
                          {mode === 'locked' ? '' : ` · ${formatOptionalPrice(f.price)}`}
                        </Text>
                      </View>
                      {mode === 'locked' ? (
                        <Pill text="Incluido" />
                      ) : (
                        <Switch
                          accessibilityLabel={f.label}
                          value={on}
                          disabled={mode === 'readonly'}
                          onValueChange={() => setEnabled((cur) => toggleKey(cur, f.key))}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ))}
        <ErrorText>{error}</ErrorText>
        {canEdit && dirty ? <Button title="Guardar" onPress={save} loading={saving} /> : null}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  priceBar: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  price: { fontSize: 17, fontWeight: '700', color: colors.text },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 8 },
  label: { fontSize: 16, color: colors.text, fontWeight: '500' },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
