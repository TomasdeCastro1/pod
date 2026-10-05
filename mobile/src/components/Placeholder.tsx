import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function Placeholder({ title }: { title: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  text: { fontSize: 16, color: colors.textMuted },
});
