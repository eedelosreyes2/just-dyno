import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClimberScreen } from './src/screens/ClimberScreen';
import { SensorDebugScreen } from './src/screens/SensorDebugScreen';

type Screen = 'climber' | 'sensors';

export default function App() {
  const [screen, setScreen] = useState<Screen>('climber');

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <Tab label="Climber" active={screen === 'climber'} onPress={() => setScreen('climber')} />
        <Tab label="Sensors" active={screen === 'sensors'} onPress={() => setScreen('sensors')} />
      </View>
      {/* Only the active screen is mounted, so only one sensor subscription runs. */}
      {screen === 'climber' ? <ClimberScreen /> : <SensorDebugScreen />}
      <StatusBar style="auto" />
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#eef2f7' },
  tabActive: { backgroundColor: '#3d7be8' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#333' },
  tabTextActive: { color: '#fff' },
});
