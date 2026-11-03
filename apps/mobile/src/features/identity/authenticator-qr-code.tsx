import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { AppText } from "@/components/app-text";
import { createQrCodePath } from "./qr-code-path";

export function AuthenticatorQrCode({
  value,
}: {
  value: string;
}): React.JSX.Element {
  const graphic = useMemo(() => createQrCodePath(value), [value]);
  if (!graphic)
    return (
      <AppText accessibilityLiveRegion="polite">
        QR setup is unavailable. Use the private manual setup key below.
      </AppText>
    );
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Scan this private setup QR code with your authenticator app"
      style={{
        alignSelf: "center",
        width: "100%",
        maxWidth: 240,
        aspectRatio: 1,
      }}
    >
      <Svg
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        width="100%"
        height="100%"
        viewBox={`0 0 ${graphic.moduleCount} ${graphic.moduleCount}`}
      >
        <Rect
          width={graphic.moduleCount}
          height={graphic.moduleCount}
          fill="#fff"
        />
        <Path d={graphic.path} fill="#000" />
      </Svg>
    </View>
  );
}
