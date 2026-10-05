import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { colors } from '../theme';

/** Encabezado común: empresa activa. Tocarlo abrirá el selector de empresa (T5.1). */
export function CompanyHeader() {
  const { activeCompany } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cambiar de empresa"
      onPress={() => {
        // T5.1: abre el selector de empresa.
      }}
      style={[styles.bar, { paddingTop: insets.top + 8 }]}
    >
      <Text style={styles.name} numberOfLines={1}>
        {activeCompany?.nombre ?? 'Sin empresa'}
      </Text>
      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
    </Pressable>
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
});
