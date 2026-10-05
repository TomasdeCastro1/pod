import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../src/api/client';
import { errorMessage } from '../../src/api/errorMessage';
import { ArchiveRow } from '../../src/archive/ArchiveRow';
import { shareCsv } from '../../src/archive/files';
import { FilterSheet } from '../../src/archive/FilterSheet';
import {
  activeChips,
  clearFilters,
  filtersToQuery,
  hasAnyFilter,
  hasProcessing,
  removeFilter,
} from '../../src/archive/filters';
import {
  setArchiveFilters,
  updateArchiveFilters,
  useArchiveFilters,
} from '../../src/archive/store';
import { useAuth } from '../../src/auth/AuthProvider';
import { colors } from '../../src/theme';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;
const PROCESSING_REFRESH_MS = 4000;

export default function ArchivoScreen() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id ?? null;
  const router = useRouter();
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const filters = useArchiveFilters();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [text, setText] = useState(filters.q);

  // Búsqueda con debounce de 300 ms.
  useEffect(() => {
    if (text === filters.q) return;
    const t = setTimeout(
      () => updateArchiveFilters((f) => ({ ...f, q: text })),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [text, filters.q]);

  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const chips = activeChips(filters);

  const list = useInfiniteQuery({
    queryKey: ['scans', companyId, query],
    enabled: companyId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.scans.list(companyId!, { ...query, cursor: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // Los escaneos «procesando» se refrescan solos mientras la pantalla está visible.
    refetchInterval: (q) => {
      const items = q.state.data?.pages.flatMap((p) => p.items) ?? [];
      return focused && hasProcessing(items) ? PROCESSING_REFRESH_MS : false;
    },
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  // Las miniaturas son URLs firmadas que vencen: si una falla, se piden de nuevo (una vez cada tanto).
  const lastThumbRefresh = useRef(0);
  const onThumbError = useCallback(() => {
    if (Date.now() - lastThumbRefresh.current < 15_000) return;
    lastThumbRefresh.current = Date.now();
    void queryClient.invalidateQueries({ queryKey: ['scans', companyId] });
  }, [queryClient, companyId]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!companyId) return;
    setExporting(true);
    try {
      // Exactamente lo que está filtrado en la lista.
      await shareCsv(companyId, filtersToQuery(filters));
    } catch (e) {
      Alert.alert('No se pudo exportar', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const showEmpty = !list.isLoading && !list.isError && items.length === 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Cliente, número, RUT o sello"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Buscar comprobantes"
          />
          {text ? (
            <Pressable
              accessibilityLabel="Borrar búsqueda"
              hitSlop={10}
              onPress={() => {
                setText('');
                updateArchiveFilters((f) => ({ ...f, q: '' }));
              }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exportar a CSV"
          onPress={() => void exportCsv()}
          disabled={exporting || !companyId}
          style={[styles.filterBtn, (exporting || !companyId) && { opacity: 0.5 }]}
        >
          {exporting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filtros"
          onPress={() => setSheetOpen(true)}
          style={[styles.filterBtn, chips.length > 0 && styles.filterBtnOn]}
        >
          <Ionicons name="options" size={22} color={chips.length > 0 ? '#fff' : colors.primary} />
        </Pressable>
      </View>

      {chips.length > 0 ? (
        <View style={styles.chipsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chips.map((c) => (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={`Quitar filtro ${c.label}`}
                onPress={() => setArchiveFilters(removeFilter(filters, c.key))}
                style={styles.activeChip}
              >
                <Text style={styles.activeChipText}>{c.label}</Text>
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setArchiveFilters(clearFilters(filters))}
          >
            <Text style={styles.clear}>Limpiar</Text>
          </Pressable>
        </View>
      ) : null}

      {list.isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : list.isError && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{errorMessage(list.error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void list.refetch()}>
            <Text style={styles.clear}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <ArchiveRow
              scan={item}
              onThumbError={onThumbError}
              onPress={() => router.push({ pathname: '/archivo/[id]', params: { id: item.id } })}
            />
          )}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            showEmpty ? (
              <Text style={styles.empty}>
                {hasAnyFilter(filters)
                  ? 'No hay resultados con estos filtros'
                  : 'Todavía no hay comprobantes'}
              </Text>
            ) : null
          }
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <ActivityIndicator style={{ margin: 16 }} color={colors.primary} />
            ) : null
          }
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : { paddingBottom: 24 }}
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        onApply={(f) => {
          setText(f.q);
          setArchiveFilters(f);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, minHeight: 46, fontSize: 16, color: colors.text },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnOn: { backgroundColor: colors.primary },
  chipsRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, marginBottom: 4 },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: '#E6EEFF',
  },
  activeChipText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  clear: { fontSize: 15, color: colors.primary, fontWeight: '600', padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { textAlign: 'center', fontSize: 16, color: colors.textMuted, padding: 24 },
});
