import { Stack } from "expo-router/stack";
import { colors } from "@/theme/tokens";

export default function GoalsLayout(): React.JSX.Element {
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
        options={{ headerShown: false, title: "Goals" }}
      />
      <Stack.Screen
        name="[goalId]"
        options={{ headerShown: false, title: "Goal detail" }}
      />
    </Stack>
  );
}
