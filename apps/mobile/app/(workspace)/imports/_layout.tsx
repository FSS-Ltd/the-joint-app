import { Stack } from "expo-router/stack";
import { colors } from "@/theme/tokens";

export default function ImportsLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.forest },
        headerTintColor: colors.ivory,
        contentStyle: { backgroundColor: colors.forest },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Import" }} />
      <Stack.Screen
        name="upload/[accountId]"
        options={{ title: "Import a CSV" }}
      />
      <Stack.Screen name="[batchId]/index" options={{ title: "Import" }} />
      <Stack.Screen
        name="[batchId]/review"
        options={{ title: "Review rows" }}
      />
      <Stack.Screen
        name="[batchId]/commit"
        options={{ title: "Commit import" }}
      />
    </Stack>
  );
}
