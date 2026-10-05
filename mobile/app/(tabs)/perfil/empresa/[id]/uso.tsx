import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '../../../../../src/api/client';
import { errorMessage } from '../../../../../src/api/errorMessage';
import { Button, ErrorText } from '../../../../../src/components/ui';
import {
  barRatios,
  formatAmount,
  formatImages,
  formatPricePer1000,
  monthLabel,
} from '../../../../../src/profile/fields';
import { Card, Page, SectionTitle } from '../../../../../src/profile/ui';
import { colors } from '../../../../../src/theme';

export default function UsoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['usage', id],
    queryFn: () => api.usage.get(id),
    enabled: !!id,
  });
  const u = query.data;

  if (query.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!u) {
    return (
      <Page>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
        <Button title="Reintentar" onPress={() => void query.refetch()} />
      </Page>
    );
  }

  const ratios = barRatios(u.history);
  return (
    <Page>
      <SectionTitle>{monthLabel(u.month)}</SectionTitle>
      <Card>
        <Stat label="Imágenes procesadas este mes" value={formatImages(u.images)} />
        <Stat label="Precio vigente" value={formatPricePer1000(u.price_per_1000_current)} />
        <Stat label="Importe estimado del mes hasta hoy" value={formatAmount(u.amount_usd)} />
      </Card>
      <Text style={styles.note}>El importe se factura una vez por mes, por fuera de la app.</Text>

      <SectionTitle>Últimos 6 meses</SectionTitle>
      <Card>
        {u.history.map((h, i) => (
          <View key={h.month} style={styles.histRow}>
            <View style={styles.histHead}>
              <Text style={styles.histMonth}>{monthLabel(h.month)}</Text>
              <Text style={styles.histValue}>
                {formatImages(h.images)} imágenes · {formatAmount(h.amount_usd)}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.round((ratios[i] ?? 0) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </Card>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { paddingVertical: 10 },
  statLabel: { fontSize: 13, color: colors.textMuted },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 2 },
  note: { fontSize: 13, color: colors.textMuted },
  histRow: { paddingVertical: 8, gap: 6 },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  histMonth: { fontSize: 14, color: colors.text, textTransform: 'capitalize' },
  histValue: { fontSize: 13, color: colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
