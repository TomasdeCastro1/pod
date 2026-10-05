import { Ionicons } from '@expo/vector-icons';
import type { ScanDto } from '@app/shared';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { docTypeLabel, formatTotal, isConformidad } from '../scan/alerts';
import { CONFORMIDAD_COLORS, CONFORMIDAD_LABELS, colors } from '../theme';

/** AAAA-MM-DD (o ISO) -> DD/MM/AAAA. */
export function formatDocDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function ArchiveRow({
  scan,
  onPress,
  onThumbError,
}: {
  scan: ScanDto;
  onPress: () => void;
  onThumbError: () => void;
}) {
  const conf = isConformidad(scan.conformidad_nivel) ? scan.conformidad_nivel : null;
  const processing = scan.status === 'procesando';
  const failed = scan.status === 'error';
  const toReview = scan.status === 'revisar' || scan.alert === 'revisar';
  const number = [scan.serie, scan.numero].filter(Boolean).join('-') || 'Sin número';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {scan.thumb_url ? (
        <Image source={{ uri: scan.thumb_url }} style={styles.thumb} onError={onThumbError} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="document-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.info}>
        {processing || failed ? (
          <>
            <Text style={styles.type}>{processing ? 'Procesando…' : 'Con error'}</Text>
            <Text style={styles.line}>{formatDocDate(scan.captured_at)}</Text>
          </>
        ) : (
          <>
            <Text style={styles.type}>{docTypeLabel(scan.doc_type)}</Text>
            <Text style={styles.client} numberOfLines={1}>
              {scan.cliente_nombre ?? 'Sin cliente'}
            </Text>
            <Text style={styles.line} numberOfLines={1}>
              {number} · {formatDocDate(scan.fecha_documento)}
            </Text>
            <Text style={styles.total}>{formatTotal(scan.total)}</Text>
          </>
        )}
      </View>
      <View style={styles.badges}>
        {conf && !processing ? (
          <View
            accessibilityLabel={`Conformidad: ${CONFORMIDAD_LABELS[conf]}`}
            style={[styles.dot, { backgroundColor: CONFORMIDAD_COLORS[conf] }]}
          />
        ) : null}
        {toReview && !processing ? (
          <Ionicons name="alert-circle" size={22} color="#B26A00" accessibilityLabel="A revisar" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  thumb: { width: 56, height: 72, borderRadius: 6, backgroundColor: colors.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  type: { fontSize: 13, fontWeight: '700', color: colors.primary },
  client: { fontSize: 16, fontWeight: '600', color: colors.text },
  line: { fontSize: 14, color: colors.textMuted },
  total: { fontSize: 15, fontWeight: '700', color: colors.text },
  badges: { alignItems: 'center', gap: 6 },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
