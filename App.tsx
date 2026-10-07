import { StatusBar } from 'expo-status-bar';

import { SensorDebugScreen } from './src/screens/SensorDebugScreen';

export default function App() {
  return (
    <>
      <SensorDebugScreen />
      <StatusBar style="auto" />
    </>
  );
}
