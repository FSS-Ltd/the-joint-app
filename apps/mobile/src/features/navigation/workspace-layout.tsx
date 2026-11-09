import type { MeResponse } from "@joint/contracts";
import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/app-text";
import { colors, spacing } from "@/theme/tokens";
import { NavigationTabButton } from "./navigation-tab-button";
import { ConfiguredEntry } from "../identity/configured-entry";
import { NativeFinanceProvider } from "../finance/provider";

// Reachable from Home links but absent from the bar. A null href hides a tab in expo-router 58
// in a way that router.push cannot reach, so hide the button instead.
const hiddenTab = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: "none" as const },
};

function ReadyWorkspace({ me }: { me: MeResponse }): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Reserve icon, scaled label, button padding and OS inset in normal navigator layout.
  const itemHeight = Math.max(44, 24 + 20 * fontScale + 12);
  return (
    <NativeFinanceProvider me={me}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.action,
          tabBarInactiveTintColor: colors.ivory,
          tabBarAllowFontScaling: true,
          tabBarButton: (props) => <NavigationTabButton {...props} />,
          tabBarItemStyle: {
            marginHorizontal: spacing.small / 2,
            marginVertical: spacing.small / 2,
          },
          tabBarStyle: {
            backgroundColor: colors.forest,
            borderWidth: 1,
            borderColor: colors.border,
            height: itemHeight + spacing.medium + insets.bottom,
            borderRadius: 32,
            marginHorizontal: spacing.medium,
            marginBottom: spacing.small,
          },
          tabBarLabelStyle: { fontSize: 14 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarAccessibilityLabel: "Home",
            tabBarIcon: ({ color }) => (
              <AppText accessible={false} style={{ color }}>
                ⌂
              </AppText>
            ),
          }}
        />
        <Tabs.Screen name="activity" options={hiddenTab} />
        <Tabs.Screen name="imports" options={hiddenTab} />
        <Tabs.Screen name="budgets" options={hiddenTab} />
        <Tabs.Screen name="review" options={hiddenTab} />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarAccessibilityLabel: "More",
            tabBarIcon: ({ color }) => (
              <AppText accessible={false} style={{ color }}>
                •••
              </AppText>
            ),
          }}
        />
      </Tabs>
    </NativeFinanceProvider>
  );
}
export function WorkspaceLayout(): React.JSX.Element {
  return <ConfiguredEntry ready={(me) => <ReadyWorkspace me={me} />} />;
}
