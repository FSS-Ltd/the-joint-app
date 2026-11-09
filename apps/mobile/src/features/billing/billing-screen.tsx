import { Pressable, StyleSheet, View } from "react-native";
import type { HouseholdSubscriptionResponse } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { colors, corners, spacing } from "@/theme/tokens";
import type { BillingApi } from "../../api/billing";
import { useBilling } from "./use-billing";
import type { PlatformPurchaseAdapter } from "./purchase-adapter";

export interface BillingScreenProps {
  readonly householdId: string;
  readonly billingApi: BillingApi;
  readonly purchaseAdapter?: PlatformPurchaseAdapter;
  readonly initialSubscription?: HouseholdSubscriptionResponse | null;
  readonly onBack?: () => void;
  readonly onSubscriptionUpdated?: () => void;
}

export function BillingScreen({
  householdId,
  billingApi,
  purchaseAdapter,
  initialSubscription,
  onBack,
  onSubscriptionUpdated,
}: BillingScreenProps): React.JSX.Element {
  const {
    loading,
    subscription,
    isPlusActive,
    effectiveUntil,
    products,
    selectedProduct,
    selectedInterval,
    setSelectedInterval,
    purchasePending,
    restorePending,
    statusNotice,
    clearStatusNotice,
    storeAvailable,
    purchase,
    restore,
    manageSubscription,
  } = useBilling({
    householdId,
    billingApi,
    purchaseAdapter,
    initialSubscription,
    onSubscriptionUpdated,
  });

  const formattedDate = effectiveUntil
    ? new Date(effectiveUntil).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Screen>
      <View style={styles.container}>
        {onBack && (
          <NativeActions>
            <NativeAction label="Back" tone="text" compact onPress={onBack} />
          </NativeActions>
        )}

        <View style={styles.header}>
          <AppText variant="heading" tone="primary">
            Family Fund Plus
          </AppText>
          <AppText variant="body" tone="secondary">
            Keep your privacy intact. Expand household accounts, local companion
            tools, and long-term targets.
          </AppText>
        </View>

        {statusNotice && (
          <Pressable
            onPress={clearStatusNotice}
            accessibilityRole="alert"
            accessibilityLabel={`${statusNotice.tone}: ${statusNotice.text}. Tap to dismiss.`}
            style={[
              styles.notice,
              statusNotice.tone === "error" && styles.noticeError,
              statusNotice.tone === "warning" && styles.noticeWarning,
              statusNotice.tone === "success" && styles.noticeSuccess,
            ]}
          >
            <AppText
              variant="label"
              style={[
                styles.noticeText,
                statusNotice.tone === "error" && styles.noticeTextError,
                statusNotice.tone === "warning" && styles.noticeTextWarning,
                statusNotice.tone === "success" && styles.noticeTextSuccess,
              ]}
            >
              {statusNotice.text}
            </AppText>
          </Pressable>
        )}

        {loading ? (
          <Panel>
            <AppText variant="body" tone="secondary">
              Checking subscription status...
            </AppText>
          </Panel>
        ) : isPlusActive ? (
          <Panel>
            <View style={styles.badgeRow}>
              <View style={styles.activeBadge}>
                <AppText variant="label" tone="inverse">
                  ACTIVE PLUS
                </AppText>
              </View>
            </View>

            <AppText variant="title">
              Your household is on Family Fund Plus
            </AppText>

            <AppText variant="body" tone="secondary">
              {subscription?.interval === "ANNUAL"
                ? "Annual billing plan"
                : "Monthly billing plan"}
              {formattedDate ? ` · Renews or valid until ${formattedDate}` : ""}
            </AppText>

            <View style={styles.benefitsList}>
              <BenefitItem text="Up to 4 connected bank accounts across adults" />
              <BenefitItem text="Up to 2 connected investment accounts" />
              <BenefitItem text="Private on-device AI financial companion" />
              <BenefitItem text="Advanced savings projections and goal timelines" />
            </View>

            <NativeActions>
              <NativeAction
                label="Manage subscription"
                tone="primary"
                onPress={manageSubscription}
              />
              <NativeAction
                label="Restore purchases"
                tone="secondary"
                disabled={restorePending}
                pending={restorePending}
                onPress={restore}
              />
            </NativeActions>
          </Panel>
        ) : (
          <>
            <Panel>
              <AppText variant="title">
                Everything in Free, plus room to grow
              </AppText>

              <View style={styles.benefitsList}>
                <BenefitItem text="4 connected bank accounts (1 in Free)" />
                <BenefitItem text="2 investment broker accounts (0 in Free)" />
                <BenefitItem text="On-device companion with local privacy" />
                <BenefitItem text="Unlimited category caps and month-end surplus guidance" />
              </View>

              <View style={styles.selectorContainer}>
                <AppText variant="label" tone="secondary">
                  Choose your cadence
                </AppText>

                <View style={styles.optionsRow}>
                  {products.map((prod) => {
                    const isSelected = selectedInterval === prod.interval;
                    return (
                      <Pressable
                        key={prod.id}
                        onPress={() => setSelectedInterval(prod.interval)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${prod.title}, ${prod.priceFormatted}`}
                        style={[
                          styles.planCard,
                          isSelected && styles.planCardSelected,
                        ]}
                      >
                        <View style={styles.planCardHeader}>
                          <AppText
                            variant="label"
                            tone={isSelected ? "primary" : "secondary"}
                          >
                            {prod.interval === "ANNUAL" ? "Annual" : "Monthly"}
                          </AppText>
                          {prod.savingsPercentage !== undefined && (
                            <View style={styles.saveBadge}>
                              <AppText
                                variant="label"
                                tone="inverse"
                                style={styles.saveBadgeText}
                              >
                                {`Save ${prod.savingsPercentage}%`}
                              </AppText>
                            </View>
                          )}
                        </View>

                        <AppText variant="title" style={styles.priceText}>
                          {prod.priceFormatted}
                        </AppText>

                        {prod.annualEquivalentMonthlyFormatted ? (
                          <AppText
                            variant="body"
                            tone="secondary"
                            style={styles.equivalentText}
                          >
                            {`Equivalent to ${prod.annualEquivalentMonthlyFormatted}`}
                          </AppText>
                        ) : (
                          <AppText
                            variant="body"
                            tone="secondary"
                            style={styles.equivalentText}
                          >
                            Billed monthly
                          </AppText>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {!storeAvailable && (
                <AppText variant="body" style={styles.warningText}>
                  In-app purchases are disabled on this device.
                </AppText>
              )}

              <NativeActions>
                <NativeAction
                  label={
                    selectedProduct
                      ? `Subscribe for ${selectedProduct.priceFormatted}`
                      : "Subscribe"
                  }
                  tone="primary"
                  disabled={
                    !storeAvailable || purchasePending || restorePending
                  }
                  pending={purchasePending}
                  onPress={purchase}
                />
                <NativeAction
                  label="Restore existing purchases"
                  tone="secondary"
                  disabled={restorePending || purchasePending}
                  pending={restorePending}
                  onPress={restore}
                />
              </NativeActions>
            </Panel>

            <View style={styles.disclosure}>
              <AppText
                variant="body"
                tone="secondary"
                style={styles.disclosureText}
              >
                Payment is charged to your store account upon confirmation.
                Subscriptions renew automatically unless canceled at least 24
                hours before the period ends. Manage or cancel anytime in your
                store account settings.
              </AppText>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function BenefitItem({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.benefitRow}>
      <AppText variant="body" style={styles.checkmark}>
        ✓
      </AppText>
      <AppText variant="body" tone="primary" style={styles.benefitText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.large,
  },
  header: {
    gap: spacing.small,
  },
  notice: {
    padding: spacing.medium,
    borderRadius: corners.action,
    backgroundColor: colors.sage,
  },
  noticeError: {
    backgroundColor: colors.apricot,
    borderWidth: 1,
    borderColor: colors.error,
  },
  noticeWarning: {
    backgroundColor: colors.apricot,
  },
  noticeSuccess: {
    backgroundColor: colors.sage,
  },
  noticeText: {
    color: colors.forest,
  },
  noticeTextError: {
    color: colors.error,
  },
  noticeTextWarning: {
    color: colors.forest,
  },
  noticeTextSuccess: {
    color: colors.action,
  },
  badgeRow: {
    flexDirection: "row",
  },
  activeBadge: {
    backgroundColor: colors.action,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small / 2,
    borderRadius: corners.action,
  },
  benefitsList: {
    gap: spacing.small,
    marginVertical: spacing.small,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.small,
  },
  checkmark: {
    color: colors.action,
    fontWeight: "700",
  },
  benefitText: {
    flex: 1,
  },
  selectorContainer: {
    gap: spacing.small,
    marginVertical: spacing.small,
  },
  optionsRow: {
    flexDirection: "row",
    gap: spacing.medium,
  },
  planCard: {
    flex: 1,
    padding: spacing.medium,
    borderRadius: corners.surface,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 110,
    justifyContent: "space-between",
  },
  planCardSelected: {
    borderColor: colors.action,
    borderWidth: 2,
    backgroundColor: colors.ivory,
  },
  planCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saveBadge: {
    backgroundColor: colors.action,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  priceText: {
    marginVertical: spacing.small / 2,
  },
  equivalentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  warningText: {
    color: colors.error,
  },
  disclosure: {
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.large,
  },
  disclosureText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
