import type { GetAmbassadorDashboardResponse } from "@bet/contracts";
import { getAmbassadorDashboard, isApiResponseError } from "../lib/api";
import { getCurrentWebUser } from "./auth-session";

export type AmbassadorDashboardState =
  | { kind: "signed_out" }
  | { kind: "ok"; dashboard: GetAmbassadorDashboardResponse }
  | { kind: "expired_session"; status: 401; code?: string | null }
  | { kind: "unavailable"; status: number; code?: string | null; source?: string | null; message?: string | null };

export const resolveAmbassadorDashboardState = async (): Promise<AmbassadorDashboardState> => {
  const user = await getCurrentWebUser();
  if (!user) return { kind: "signed_out" };

  try {
    const dashboard = await getAmbassadorDashboard();
    return { kind: "ok", dashboard };
  } catch (error) {
    if (isApiResponseError(error)) {
      if (error.status === 401) {
        return { kind: "expired_session", status: 401, code: error.code };
      }

      return {
        kind: "unavailable",
        status: error.status,
        code: error.code,
        source: error.source,
        message: error.message,
      };
    }

    return {
      kind: "unavailable",
      status: 500,
      code: null,
      source: null,
      message: error instanceof Error ? error.message : null,
    };
  }
};
