import { BottomSheet, Column, RNHostView, ScrollView } from "@expo/ui";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { colors, spacing } from "@/theme/tokens";

type SharingSheetProps = { isPresented: boolean; onDismiss: () => void };

export function SharingSheet({
  isPresented,
  onDismiss,
}: SharingSheetProps): React.JSX.Element {
  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={["full"]}
      containerColor={colors.ivory}
      contentPadding={spacing.large}
    >
      <ScrollView>
        <Column spacing={spacing.large} style={{ width: "100%" }}>
          <RNHostView matchContents={{ vertical: true }}>
            <View style={styles.copy}>
              <AppText variant="title" accessibilityRole="header">
                How sharing works
              </AppText>
              <AppText>
                Your accounts are private by default. You choose whether your
                partner sees nothing, values only, or values and transaction
                details.
              </AppText>
              <AppText tone="secondary">
                Sharing visibility does not change ownership or let another
                adult edit your records.
              </AppText>
              <AppText tone="secondary">
                The app records and explains information. It does not move
                money.
              </AppText>
            </View>
          </RNHostView>
          <NativeAction label="Close" onPress={onDismiss} />
        </Column>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.large },
});
