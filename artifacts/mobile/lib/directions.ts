import { Linking, Platform } from "react-native";

export function openDirections(lat: number, lng: number): void {
  const url =
    Platform.OS === "ios"
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  Linking.openURL(url).catch(() => {});
}
