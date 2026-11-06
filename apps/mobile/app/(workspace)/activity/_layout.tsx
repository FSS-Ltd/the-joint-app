import { Stack } from "expo-router/stack";
import { colors } from "@/theme/tokens";

export default function ActivityLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.forest },
        headerTintColor: colors.ivory,
        contentStyle: { backgroundColor: colors.forest },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Activity" }} />
      <Stack.Screen
        name="[transactionId]/index"
        options={{ title: "Transaction" }}
      />
      <Stack.Screen
        name="[transactionId]/annotate"
        options={{ title: "Edit transaction" }}
      />
      <Stack.Screen
        name="[transactionId]/splits"
        options={{ title: "Split transaction" }}
      />
    </Stack>
  );
}
