// Conexões: matches novos, ainda sem conversa
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Screen } from '@/components/ui';
import { api, type MatchRow } from '@/lib/api';
import { useSignedUrls } from '@/lib/photos';
import { font, fonts, palette, radius, space, useColors } from '@/theme';

export default function Conexoes() {
  const c = useColors();
  const router = useRouter();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const urls = useSignedUrls(rows.map((r) => r.photo));

  const load = useCallback(async () => {
    setRefreshing(true); setLoadError(false);
    try { setRows((await api.matches()).filter((r) => !r.last_message)); } catch { setLoadError(true); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (r: MatchRow) => router.push({
    pathname: '/chat/[id]', params: { id: r.match_id, name: r.display_name, other: r.other_id },
  });

  if (loadError) return <Screen><View style={{ padding: space.xl, gap: space.md }}>
    <Text style={[font.body, { color: c.text }]}>Não conseguimos carregar suas conexões. Confira a conexão.</Text>
    <Button title="Tentar novamente" onPress={load} loading={refreshing} />
  </View></Screen>;

  if (!rows.length && !refreshing) {
    return (
      <Screen>
        <Empty title="Nenhuma conexão nova"
          body="Quando a curtida for recíproca, a pessoa aparece aqui. Continue explorando." />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={rows}
        numColumns={2}
        keyExtractor={(r) => r.match_id}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.text} />}
        ListHeaderComponent={
          <Text style={[font.small, { color: c.textMuted, marginBottom: space.xs }]}>
            Vocês se curtiram. Que tal mandar a primeira mensagem?
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} style={[styles.card, { backgroundColor: c.surfaceAlt }]}
            accessibilityLabel={`Mandar mensagem para ${item.display_name}`}>
            <Image source={item.photo ? { uri: urls[item.photo] } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.caption}>
              <Text style={styles.name}>{item.display_name}, {item.age}</Text>
              {item.competition ? <Text style={styles.comp} numberOfLines={1}>{item.competition}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', maxWidth: '48.5%' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md, backgroundColor: 'rgba(11,37,69,0.6)' },
  name: { color: palette.claro, fontSize: 18, fontFamily: fonts.display },
  comp: { color: 'rgba(248,250,252,0.85)', fontSize: 12, fontFamily: fonts.medium },
});
