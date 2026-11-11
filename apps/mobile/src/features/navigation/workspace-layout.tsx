import type { MeResponse } from "@joint/contracts";
import { Tabs } from "expo-router";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type ColorValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/app-text";
import { colors, spacing } from "@/theme/tokens";
import { NavigationTabButton } from "./navigation-tab-button";
import { ConfiguredEntry } from "../identity/configured-entry";
import { AccountScreen } from "../identity/account-screen";
import { NativeFinanceProvider } from "../finance/provider";

// Reachable from feature links but absent from the bar. A null href hides a tab in expo-router 58
// in a way that router.push cannot reach, so hide the button instead.
const hiddenTab = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: "none" as const },
};

const tabIcons = {
  Home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  Activity: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6",
  Goals:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-5h.01",
  Wealth: "m3 17 6-6 4 4 7-8m-5 0h5v5",
  More: "M4 12h.01m7.99 0h.01m7.99 0h.01",
} as const;

function tabOptions(
  title: keyof typeof tabIcons,
  labelSize: number,
  labelScale: number,
) {
  return {
    title,
    tabBarAccessibilityLabel: title,
    tabBarIcon: ({ color }: { color: ColorValue | null }) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
        <Path
          d={tabIcons[title]}
          fill="none"
          stroke={color ?? colors.sage}
          strokeWidth={title === "More" ? 3 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    ),
    tabBarLabel: ({ color }: { color: ColorValue | null }) => (
      <AppText
        variant="label"
        numberOfLines={1}
        maxFontSizeMultiplier={labelScale}
        style={[
          styles.label,
          { color: color ?? undefined, fontSize: labelSize },
        ]}
      >
        {title}
      </AppText>
    ),
  };
}

function ReadyWorkspace({ me }: { me: MeResponse }): React.JSX.Element {
  const { fontScale, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabWidth = (width - spacing.medium * 2) / 5;
  const labelSize = width < 360 ? 11 : 12;
  // Keep tab labels readable within five targets. Router supplies the iOS Large Content Viewer.
  const labelScale = Math.max(1, (tabWidth - 18) / (labelSize * 3.9));
  const itemHeight = Math.max(
    44,
    24 + 16 * Math.min(fontScale, labelScale) + spacing.medium,
  );
  const optionsFor = (title: keyof typeof tabIcons) =>
    tabOptions(title, labelSize, labelScale);
  return (
    <NativeFinanceProvider me={me}>
      <View style={styles.shell}>
        <Tabs
          safeAreaInsets={{ bottom: 0 }}
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.forest,
            tabBarInactiveTintColor: colors.sage,
            tabBarAllowFontScaling: true,
            tabBarLabelPosition: "below-icon",
            tabBarHideOnKeyboard: true,
            tabBarIconStyle: styles.icon,
            tabBarButton: (props) => <NavigationTabButton {...props} />,
            tabBarItemStyle: {
              marginHorizontal: spacing.small / 2,
              marginVertical: spacing.small / 2,
            },
            tabBarStyle: {
              backgroundColor: colors.action,
              borderTopWidth: 0,
              height: itemHeight + spacing.small,
              borderRadius: (itemHeight + spacing.small) / 2,
              marginHorizontal: spacing.medium,
              marginBottom: spacing.small + insets.bottom,
            },
          }}
        >
          <Tabs.Screen name="home" options={optionsFor("Home")} />
          <Tabs.Screen name="activity" options={optionsFor("Activity")} />
          <Tabs.Screen name="goals" options={optionsFor("Goals")} />
          <Tabs.Screen name="wealth" options={optionsFor("Wealth")} />
          <Tabs.Screen name="more" options={optionsFor("More")} />
          <Tabs.Screen name="imports" options={hiddenTab} />
          <Tabs.Screen name="budgets" options={hiddenTab} />
          <Tabs.Screen name="review" options={hiddenTab} />
          <Tabs.Screen name="billing" options={hiddenTab} />
          <Tabs.Screen name="companion" options={hiddenTab} />
        </Tabs>
      </View>
    </NativeFinanceProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.forest },
  icon: { width: 26, height: 24 },
  label: { fontSize: 12, lineHeight: 16, textAlign: "center" },
});
export function WorkspaceLayout(): React.JSX.Element {
  return (
    <ConfiguredEntry
      ready={(me) =>
        me.membership ? <ReadyWorkspace me={me} /> : <AccountScreen me={me} />
      }
    />
  );
}
