import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { DT } from './sim';

// Step 1 smoke test: proves Skia renders in Expo Go and the app can import from sim/.
export default function App() {
  const { width } = useWindowDimensions();
  const hold = vec(width / 2, 120);
  const climber = vec(width / 2, 320);

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Line p1={hold} p2={climber} color="#888" strokeWidth={3} />
        <Circle c={hold} r={10} color="#e8a33d" />
        <Circle c={climber} r={24} color="#3d7be8" />
      </Canvas>
      <Text style={styles.label}>Sim step: {(DT * 1000).toFixed(2)} ms (120 Hz)</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  canvas: {
    flex: 1,
  },
  label: {
    padding: 24,
    textAlign: 'center',
  },
});
