import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function TwitchCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(tabs)/stream");
  }, []);

  return null;
}
