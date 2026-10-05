import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import type { Conformidad } from '@app/shared';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { CONFORMIDAD_COLORS, CONFORMIDAD_LABELS, colors } from '../theme';
import {
  CONFORMIDAD_ORDER,
  EMPTY_FILTERS,
  TYPE_LABELS,
  formatIsoDate,
  fromIsoDate,
  setDateRange,
  toIsoDate,
  type ArchiveFilters,
  type DocTypeFilter,
} from './filters';

function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {color ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? fromIsoDate(value) : new Date();

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS !== 'ios') setIosOpen(false);
    if (e.type === 'set' && d) onChange(toIsoDate(d));
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', onChange: handle });
    } else {
      setIosOpen((o) => !o);
    }
  };

  return (
    <View style={styles.dateBox}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={open} style={styles.dateBtn}>
        <Text style={styles.dateText}>{value ? formatIsoDate(value) : 'Elegir'}</Text>
      </Pressable>
      {value ? (
        <Pressable accessibilityRole="button" onPress={() => onChange(null)}>
          <Text style={styles.dateClear}>Quitar</Text>
        </Pressable>
      ) : null}
      {iosOpen && Platform.OS === 'ios' ? (
        <DateTimePicker value={current} mode="date" display="inline" onChange={handle} />
      ) : null}
    </View>
  );
}

/** Hoja inferior con los filtros. Edita una copia y aplica al tocar «Aplicar». */
export function FilterSheet({
  visible,
  filters,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: ArchiveFilters;
  onApply: (f: ArchiveFilters) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);
  const [wasVisible, setWasVisible] = useState(false);
  // Al abrir, el borrador parte de los filtros vigentes.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(filters);
  }

  const toggleConf = (c: Conformidad) =>
    setDraft((d) => ({
      ...d,
      conformidad: d.conformidad.includes(c)
        ? d.conformidad.filter((x) => x !== c)
        : [...d.conformidad, c],
    }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar filtros" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Filtros</Text>

          <Text style={styles.section}>Tipo</Text>
          <View style={styles.wrap}>
            {(Object.keys(TYPE_LABELS) as DocTypeFilter[]).map((t) => (
              <Chip
                key={t}
                label={TYPE_LABELS[t]}
                selected={draft.type === t}
                onPress={() => setDraft((d) => ({ ...d, type: d.type === t ? null : t }))}
              />
            ))}
          </View>

          <Text style={styles.section}>Conformidad</Text>
          <View style={styles.wrap}>
            {CONFORMIDAD_ORDER.map((c) => (
              <Chip
                key={c}
                label={CONFORMIDAD_LABELS[c]}
                color={CONFORMIDAD_COLORS[c]}
                selected={draft.conformidad.includes(c)}
                onPress={() => toggleConf(c)}
              />
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Solo «a revisar»</Text>
            <Switch
              value={draft.revisar}
              onValueChange={(v) => setDraft((d) => ({ ...d, revisar: v }))}
            />
          </View>

          <Text style={styles.section}>Fecha de captura</Text>
          <DateField
            label="Desde"
            value={draft.from}
            onChange={(iso) => setDraft((d) => setDateRange(d, 'from', iso))}
          />
          <DateField
            label="Hasta"
            value={draft.to}
            onChange={(iso) => setDraft((d) => setDateRange(d, 'to', iso))}
          />
        </ScrollView>
        <Button
          title="Aplicar"
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        />
        <Button
          title="Limpiar filtros"
          variant="link"
          onPress={() => setDraft((d) => ({ ...EMPTY_FILTERS, q: d.q }))}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  section: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginTop: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: '#E6EEFF' },
  chipDot: { width: 12, height: 12, borderRadius: 6 },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { color: colors.primary, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  switchLabel: { fontSize: 16, color: colors.text },
  dateBox: { marginTop: 8 },
  dateLabel: { fontSize: 13, color: colors.textMuted },
  dateBtn: {
    marginTop: 4,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dateText: { fontSize: 16, color: colors.text },
  dateClear: { fontSize: 14, color: colors.primary, paddingVertical: 6 },
});
