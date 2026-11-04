import type { MeResponse } from "@joint/contracts";
import { Tabs } from "expo-router";
import { AppText } from "@/components/app-text";
import { colors } from "@/theme/tokens";
import { ConfiguredEntry } from "../identity/configured-entry";
import { NativeFinanceProvider } from "../finance/provider";

function ReadyWorkspace({ me }: { me: MeResponse }): React.JSX.Element {
  return (
    <NativeFinanceProvider me={me}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.action,
          tabBarInactiveTintColor: colors.secondary,
          tabBarStyle: {
            backgroundColor: colors.ivory,
            borderTopWidth: 0,
            borderRadius: 32,
            marginHorizontal: 16,
            marginBottom: 8,
          },
          tabBarLabelStyle: { fontSize: 14 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarAccessibilityLabel: "Home",
            tabBarIcon: () => <AppText accessible={false}>⌂</AppText>,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarAccessibilityLabel: "More",
            tabBarIcon: () => <AppText accessible={false}>•••</AppText>,
          }}
        />
      </Tabs>
    </NativeFinanceProvider>
  );
}
export function WorkspaceLayout(): React.JSX.Element {
  return <ConfiguredEntry ready={(me) => <ReadyWorkspace me={me} />} />;
}
