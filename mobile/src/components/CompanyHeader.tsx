import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { colors } from '../theme';
import { CompanyList } from './CompanyList';

/** Encabezado común: empresa activa. Tocarlo abre el selector de empresa (hoja inferior). */
export function CompanyHeader() {
  const { activeCompany, companies, setActiveCompanyId } = useAuth();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cambiar de empresa"
        onPress={() => setOpen(true)}
        style={[styles.bar, { paddingTop: insets.top + 8 }]}
      >
        <Text style={styles.name} numberOfLines={1}>
          {activeCompany?.nombre ?? 'Sin empresa'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Cerrar"
          onPress={() => setOpen(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Elegí la empresa</Text>
          <CompanyList
            companies={companies}
            activeId={activeCompany?.id ?? null}
            onSelect={(c) => {
              setActiveCompanyId(c.id);
              setOpen(false);
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { fontSize: 17, fontWeight: '600', color: colors.text, maxWidth: '80%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
});
