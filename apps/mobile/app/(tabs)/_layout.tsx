import { Tabs } from 'expo-router';
import { TabIcon } from '@/components/TabIcon';
import { fonts, useColors } from '@/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.bg },
      headerTintColor: c.text,
      headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
      headerShadowVisible: false,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 68, paddingTop: 6 },
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.textMuted,
      tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.semibold, paddingBottom: 6 },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Descobrir', tabBarIcon: ({ color }) => <TabIcon name="descobrir" color={color} /> }} />
      <Tabs.Screen name="conexoes" options={{ title: 'Conexões', tabBarIcon: ({ color }) => <TabIcon name="conexoes" color={color} /> }} />
      <Tabs.Screen name="mensagens" options={{ title: 'Mensagens', tabBarIcon: ({ color }) => <TabIcon name="mensagens" color={color} /> }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <TabIcon name="perfil" color={color} /> }} />
    </Tabs>
  );
}
