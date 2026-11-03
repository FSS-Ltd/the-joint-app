import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NativeIdentityProvider } from "@/features/identity/provider";
import { publicConfiguration } from "@/features/identity/public-configuration";

import { colors } from "@/theme/tokens";

function Navigation(): React.JSX.Element {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.forest },
        }}
      />
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      {publicConfiguration.kind === "configured" ? (
        <NativeIdentityProvider configuration={publicConfiguration.value}>
          <Navigation />
        </NativeIdentityProvider>
      ) : (
        <Navigation />
      )}
    </SafeAreaProvider>
  );
}
