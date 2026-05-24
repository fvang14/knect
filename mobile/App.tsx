import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { WsProvider } from '@/context/WsContext';
import { RootNavigator } from '@/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WsProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </WsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
