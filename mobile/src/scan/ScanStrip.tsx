import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CONFORMIDAD_COLORS, CONFORMIDAD_LABELS, colors } from '../theme';
import { docTypeLabel, formatTotal, isConformidad, pickAlert } from './alerts';
import type { CaptureItem } from './manager';

function Card({ item }: { item: CaptureItem }) {
  const scan = item.scan;
  const conf = scan && isConformidad(scan.conformidad_nivel) ? scan.conformidad_nivel : null;
  const alert = scan ? pickAlert(scan) : null;

  let status: string | null = null;
  if (item.status === 'preparing' || item.status === 'uploading' || item.status === 'processing')
    status = 'Procesando…';
  else if (item.status === 'pending') status = 'Pendiente de envío';
  else if (item.status === 'timeout') status = 'Procesando…';
  else if (item.status === 'failed') status = 'No se pudo enviar';
  else if (alert === 'error') status = 'No pudimos procesarlo, lo reintentamos solo';
  else if (alert === 'no_leido') status = 'No se pudo leer';

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Image source={{ uri: item.uri }} style={styles.thumb} />
      <View style={styles.info}>
        {status || !scan ? (
          <Text style={styles.status} numberOfLines={2}>
            {status ?? 'Procesando…'}
          </Text>
        ) : (
          <>
            <Text style={styles.type}>{docTypeLabel(scan.doc_type)}</Text>
            <Text style={styles.line} numberOfLines={1}>
              {scan.cliente_nombre ?? 'Sin cliente'}
            </Text>
            <Text style={styles.line} numberOfLines={1}>
              {[scan.serie, scan.numero].filter(Boolean).join('-') || 'Sin número'}
            </Text>
            <Text style={styles.total}>{formatTotal(scan.total)}</Text>
          </>
        )}
      </View>
      {conf && !status ? (
        <View style={styles.conf}>
          <View
            accessibilityLabel={`Conformidad: ${CONFORMIDAD_LABELS[conf]}`}
            style={[styles.dot, { backgroundColor: CONFORMIDAD_COLORS[conf] }]}
          />
          {alert === 'revisar' ? (
            <Ionicons
              name="alert-circle"
              size={20}
              color="#B26A00"
              accessibilityLabel="A revisar"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Tira inferior: la más reciente a la izquierda. */
export function ScanStrip({ items }: { items: CaptureItem[] }) {
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {items.map((it) => (
        <Card key={it.clientId} item={it} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  card: {
    flexDirection: 'row',
    width: 250,
    gap: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  thumb: { width: 56, height: 72, borderRadius: 6, backgroundColor: colors.border },
  info: { flex: 1 },
  status: { fontSize: 14, color: colors.textMuted },
  type: { fontSize: 13, fontWeight: '700', color: colors.primary },
  line: { fontSize: 14, color: colors.text },
  total: { fontSize: 15, fontWeight: '700', color: colors.text },
  conf: { alignItems: 'center', gap: 6 },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
