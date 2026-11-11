import { Stack } from "expo-router/stack";
import { colors } from "@/theme/tokens";
export default function HomeLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.forest },
        headerTintColor: colors.ivory,
        contentStyle: { backgroundColor: colors.forest },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false, title: "Home" }}
      />
      <Stack.Screen
        name="accounts/index"
        options={{ title: "Your accounts" }}
      />
      <Stack.Screen
        name="accounts/[accountId]/index"
        options={{ title: "Account" }}
      />
      <Stack.Screen name="accounts/new" options={{ title: "New account" }} />
      <Stack.Screen
        name="accounts/[accountId]/edit"
        options={{ title: "Edit account" }}
      />
      <Stack.Screen
        name="accounts/[accountId]/valuation"
        options={{ title: "Valuation" }}
      />
      <Stack.Screen
        name="accounts/[accountId]/sharing"
        options={{ title: "Sharing" }}
      />
    </Stack>
  );
}
