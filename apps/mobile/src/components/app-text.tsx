import { Text, StyleSheet, type TextProps } from "react-native";

import { colors } from "@/theme/tokens";

type AppTextProps = TextProps & {
  variant?: "body" | "heading" | "title" | "label";
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
  body: { fontSize: 17, lineHeight: 26 },
  heading: { fontSize: 32, lineHeight: 39, fontWeight: "600" },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "600" },
  label: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  primary: { color: colors.forest },
  secondary: { color: colors.secondary },
  inverse: { color: colors.ivory },
});
