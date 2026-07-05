import Constants from "expo-constants";
import { setBaseUrl } from "@workspace/api-client-react";

// Generated api-client-react hooks build relative URLs that already include the
// server's "/api" mount prefix (e.g. "/api/assistant/conversations"), so the
// base URL here should just be the bare server origin.
export const apiServerUrl =
  (Constants.expoConfig?.extra?.apiServerUrl as string | undefined) ?? null;

setBaseUrl(apiServerUrl);
