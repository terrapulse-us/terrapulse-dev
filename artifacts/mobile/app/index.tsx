import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { View, ActivityIndicator } from "react-native";
import TerraPulseLogo from "@/components/TerraPulseLogo";

export default function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#EBE4D1", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <TerraPulseLogo color="#1E3A1E" size="lg" />
        <ActivityIndicator color="#1E3A1E" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/map" />;
}
