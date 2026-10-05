import { Ionicons } from '@expo/vector-icons';
import type { MeCompany } from '@app/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { ROLE_LABELS } from '../profile/permissions';

/** Lista de empresas con la activa marcada; tocar una la activa. Se usa en Perfil y en el selector del encabezado. */
export function CompanyList({
  companies,
  activeId,
  onSelect,
}: {
  companies: MeCompany[];
  activeId: string | null;
  onSelect: (c: MeCompany) => void;
}) {
  return (
    <View>
      {companies.map((c) => {
        const active = c.id === activeId;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${c.nombre}${active ? ', empresa activa' : ''}`}
            onPress={() => onSelect(c)}
            style={styles.row}
          >
            <Ionicons
              name={active ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={active ? colors.primary : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {c.nombre}
              </Text>
              <Text style={styles.sub}>{ROLE_LABELS[c.role]}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
});
