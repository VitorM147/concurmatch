import { Tabs } from 'expo-router';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.bg },
      headerTintColor: c.text,
      headerShadowVisible: false,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 64 },
      tabBarActiveTintColor: c.text,
      tabBarInactiveTintColor: c.textMuted,
      tabBarIconStyle: { display: 'none' },
      tabBarLabelStyle: { fontSize: 14, fontWeight: '700', paddingBottom: 6 },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Descobrir' }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
