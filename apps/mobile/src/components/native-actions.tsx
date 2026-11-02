import { Column, Host } from "@expo/ui";
import type { PropsWithChildren } from "react";
import { colors, spacing } from "@/theme/tokens";
export function NativeActions({
  children,
}: PropsWithChildren): React.JSX.Element {
  return (
    <Host
      colorScheme="light"
      seedColor={colors.action}
      matchContents={{ vertical: true }}
    >
      <Column spacing={spacing.small}>{children}</Column>
    </Host>
  );
}
