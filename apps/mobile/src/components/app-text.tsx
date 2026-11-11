import { Text, StyleSheet, type TextProps } from "react-native";

import { colors } from "@/theme/tokens";

type AppTextProps = TextProps & {
  variant?: "body" | "heading" | "title" | "label" | "amount";
  tone?: "primary" | "secondary" | "inverse";
};

export function AppText({
  variant = "body",
  tone = "primary",
  style,
  ...props
}: AppTextProps): React.JSX.Element {
  return <Text {...props} style={[styles[variant], styles[tone], style]} />;
}

const styles = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24 },
  heading: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "600" },
  label: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  amount: { fontSize: 38, fontWeight: "600", fontVariant: ["tabular-nums"] },
  primary: { color: colors.forest },
  secondary: { color: colors.secondary },
  inverse: { color: colors.ivory },
});
