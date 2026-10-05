import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PatchScanBody } from '@app/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { ImagePreview, ZoomViewer } from '../../src/archive/ZoomImage';
import {
  ITEM_COLUMN_LABELS,
  buildClearCorrectionPatch,
  buildCorrectionPatch,
  buildReviewedPatch,
  canDelete,
  displayValue,
  editorText,
  fieldKind,
  itemsTable,
  orderFieldKeys,
  type DetailScan,
} from '../../src/archive/edit';
import { shareScanImage } from '../../src/archive/files';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button, ErrorText } from '../../src/components/ui';
import { docTypeLabel, isConformidad } from '../../src/scan/alerts';
import { CONFORMIDAD_COLORS, CONFORMIDAD_LABELS, colors } from '../../src/theme';

const HIDDEN_KEYS = new Set(['revisar']);

function ItemsTable({ value }: { value: unknown }) {
  const table = itemsTable(value);
  if (!table) return <Text style={styles.value}>—</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        <View style={styles.tableRow}>
          {table.columns.map((c) => (
            <Text key={c} style={[styles.cell, styles.cellHead]}>
              {ITEM_COLUMN_LABELS[c] ?? c}
            </Text>
          ))}
        </View>
        {table.rows.map((r, i) => (
          <View key={i} style={styles.tableRow}>
            {r.map((cell, j) => (
              <Text key={j} style={styles.cell}>
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id ?? null;

  const [zoomOpen, setZoomOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const scanQuery = useQuery({ queryKey: ['scan', id], queryFn: () => api.scans.get(id!) });
  const imageQuery = useQuery({
    queryKey: ['scan-image', id],
    queryFn: () => api.scans.imageUrl(id!),
    staleTime: 4 * 60_000,
  });
  const catalogQuery = useQuery({
    queryKey: ['fields', companyId],
    enabled: companyId !== null,
    queryFn: () => api.fields.get(companyId!),
    staleTime: 10 * 60_000,
  });

  const catalog = useMemo(() => {
    const labels: Record<string, string> = {};
    const order: string[] = [];
    for (const g of catalogQuery.data?.groups ?? []) {
      for (const f of g.fields) {
        labels[f.key] = f.label;
        order.push(f.key);
      }
    }
    return { labels, order };
  }, [catalogQuery.data]);

  // Estado de «revisado»: el DTO actual no lo trae, se recuerda lo que se hizo en esta pantalla.
  const [reviewedLocal, setReviewedLocal] = useState<boolean | null>(null);

  const patch = useMutation({
    mutationFn: (body: PatchScanBody) => api.scans.patch(id!, body),
    onSuccess: (scan, body) => {
      queryClient.setQueryData(['scan', id], scan);
      if (body.reviewed !== undefined) setReviewedLocal(body.reviewed);
      void queryClient.invalidateQueries({ queryKey: ['scans'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.scans.remove(id!),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['scan', id] });
      void queryClient.invalidateQueries({ queryKey: ['scans'] });
      router.back();
    },
  });

  const scan: DetailScan | undefined = scanQuery.data;
  const reviewed = reviewedLocal ?? scan?.reviewed ?? false;

  const startEdit = (key: string, value: unknown) => {
    setEditing(key);
    setDraft(editorText(key, value));
    setFieldError(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    const built = buildCorrectionPatch(editing, draft);
    if (!built.ok) return setFieldError(built.error);
    setFieldError(null);
    patch.mutate(built.body, {
      onSuccess: () => setEditing(null),
      onError: (e) => setFieldError(errorMessage(e)),
    });
  };

  const clearCorrection = (key: string) => {
    patch.mutate(buildClearCorrectionPatch(key), {
      onSuccess: () => setEditing(null),
      onError: (e) => setFieldError(errorMessage(e)),
    });
  };

  const toggleReviewed = () => {
    setActionError(null);
    patch.mutate(buildReviewedPatch(!reviewed), {
      onError: (e) => setActionError(errorMessage(e)),
    });
  };

  const share = async () => {
    setActionError(null);
    setSharing(true);
    try {
      await shareScanImage(id!);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSharing(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar comprobante',
      'Se va a eliminar este comprobante del archivo. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, { onError: (e) => setActionError(errorMessage(e)) }),
        },
      ],
    );
  };

  if (scanQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Comprobante' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!scan) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Comprobante' }} />
        <ErrorText>{errorMessage(scanQuery.error)}</ErrorText>
        <Button title="Reintentar" variant="secondary" onPress={() => void scanQuery.refetch()} />
      </View>
    );
  }

  const conf = isConformidad(scan.conformidad_nivel) ? scan.conformidad_nivel : null;
  const keys = orderFieldKeys(
    Object.keys(scan.fields).filter((k) => !HIDDEN_KEYS.has(k)),
    catalog.order,
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: docTypeLabel(scan.doc_type),
          headerBackTitle: 'Archivo',
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ImagePreview uri={imageQuery.data?.url ?? null} onPress={() => setZoomOpen(true)} />
        {imageQuery.isError ? <ErrorText>No se pudo cargar la imagen</ErrorText> : null}
        <ZoomViewer
          uri={imageQuery.data?.url ?? null}
          visible={zoomOpen}
          onClose={() => setZoomOpen(false)}
        />

        <View style={styles.badges}>
          {conf ? (
            <View style={styles.badge}>
              <View style={[styles.dot, { backgroundColor: CONFORMIDAD_COLORS[conf] }]} />
              <Text style={styles.badgeText}>{CONFORMIDAD_LABELS[conf]}</Text>
            </View>
          ) : null}
          {scan.status === 'revisar' && !reviewed ? (
            <Text style={[styles.badgeText, { color: '#B26A00' }]}>A revisar</Text>
          ) : null}
          {reviewed ? <Text style={[styles.badgeText, { color: '#2E7D32' }]}>Revisado</Text> : null}
        </View>

        {scan.revisar.length > 0 ? (
          <View style={styles.reviewBox}>
            {scan.revisar.map((r, i) => (
              <Text key={i} style={styles.reviewText}>
                {catalog.labels[r.campo] ?? r.campo}: {r.motivo}
              </Text>
            ))}
          </View>
        ) : null}

        {keys.map((key) => {
          const f = scan.fields[key]!;
          const label = catalog.labels[key] ?? key;
          const kind = fieldKind(key, f.value);
          const isEditing = editing === key;
          return (
            <View key={key} style={styles.field}>
              <View style={styles.fieldHead}>
                <Text style={styles.label}>{label}</Text>
                {f.corrected ? <Text style={styles.corrected}>corregido</Text> : null}
                {kind !== 'list' && !isEditing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${label}`}
                    onPress={() => startEdit(key, f.value)}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>Editar</Text>
                  </Pressable>
                ) : null}
              </View>
              {isEditing ? (
                <View>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    autoCapitalize="none"
                    keyboardType={kind === 'number' ? 'numbers-and-punctuation' : 'default'}
                    placeholder="Vacío para quitar la corrección"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, fieldError ? styles.inputError : null]}
                    accessibilityLabel={`Valor de ${label}`}
                  />
                  <ErrorText>{fieldError}</ErrorText>
                  <View style={styles.editActions}>
                    <Button title="Guardar" onPress={saveEdit} loading={patch.isPending} />
                    <Button title="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
                  </View>
                  {f.corrected ? (
                    <Button
                      title="Volver al valor leído"
                      variant="link"
                      onPress={() => clearCorrection(key)}
                    />
                  ) : null}
                </View>
              ) : kind === 'list' ? (
                <ItemsTable value={f.value} />
              ) : (
                <Text style={styles.value}>{displayValue(key, f.value)}</Text>
              )}
            </View>
          );
        })}
        {keys.length === 0 ? <Text style={styles.value}>No hay datos leídos todavía.</Text> : null}

        <ErrorText>{actionError}</ErrorText>
        <Button
          title={reviewed ? 'Quitar revisado' : 'Marcar como revisado'}
          onPress={toggleReviewed}
          loading={patch.isPending && editing === null}
        />
        <Button
          title="Compartir imagen"
          variant="secondary"
          onPress={() => void share()}
          loading={sharing}
        />
        {canDelete(activeCompany?.role) ? (
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={remove.isPending}
            style={styles.delete}
          >
            <Text style={styles.deleteText}>
              {remove.isPending ? 'Eliminando…' : 'Eliminar comprobante'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  badges: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  badge: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9 },
  badgeText: { fontSize: 15, fontWeight: '600', color: colors.text },
  reviewBox: { backgroundColor: '#FFF4E0', borderRadius: 10, padding: 12, gap: 4 },
  reviewText: { fontSize: 14, color: '#7A4B00' },
  field: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fieldHead: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 2 },
  label: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textMuted },
  corrected: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B26A00',
    backgroundColor: '#FFF4E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  link: { fontSize: 15, fontWeight: '600', color: colors.primary },
  value: { fontSize: 17, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: '#C62828' },
  editActions: { flexDirection: 'row', gap: 10 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  tableRow: { flexDirection: 'row' },
  cell: {
    minWidth: 80,
    maxWidth: 220,
    padding: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cellHead: { fontWeight: '700', backgroundColor: colors.surface },
  delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  deleteText: { fontSize: 16, fontWeight: '600', color: '#C62828' },
});
