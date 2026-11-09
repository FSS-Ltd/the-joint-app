import { useLocalSearchParams } from "expo-router";
import { GoalDetailScreen } from "@/features/goals/goal-detail-screen";

export default function GoalDetailRoute(): React.JSX.Element {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  return <GoalDetailScreen goalId={goalId ?? ""} />;
}
