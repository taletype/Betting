import type { GetAmbassadorDashboardResponse } from "@bet/contracts";
import { getAmbassadorDashboard, isApiResponseError } from "../lib/api";
import { getCurrentWebUser, type WebSessionUser } from "./auth-session";

export type AmbassadorDashboardUser = Pick<WebSessionUser, "id" | "email">;

export type AmbassadorDashboardState =
  | { kind: "signed_out" }
  | { kind: "ok"; user: AmbassadorDashboardUser; dashboard: GetAmbassadorDashboardResponse }
  | { kind: "expired_session"; user: AmbassadorDashboardUser; status: 401; code?: string | null }
  | { kind: "unavailable"; user: AmbassadorDashboardUser; status: number; code?: string | null; source?: string | null; message?: string | null };

const secretBearingDiagnosticPattern = /token|cookie|authorization|auth[-_\s]*header|bearer|secret|service[-_\s]*role|api[-_\s]*secret|private[-_\s]*key/i;

export const sanitizeAmbassadorDashboardDiagnostic = (value: string | null | undefined): string | null => {
  const normalized = value?.replace(/[\r\n]+/g, " ").trim();
  if (!normalized || secretBearingDiagnosticPattern.test(normalized)) return null;
  return normalized.slice(0, 120);
};

const toDashboardUser = (user: WebSessionUser): AmbassadorDashboardUser => ({
  id: user.id,
  email: user.email,
});

export const resolveAmbassadorDashboardState = async (): Promise<AmbassadorDashboardState> => {
  const user = await getCurrentWebUser();
  if (!user) return { kind: "signed_out" };
  const dashboardUser = toDashboardUser(user);

  try {
    const dashboard = await getAmbassadorDashboard();
    return { kind: "ok", user: dashboardUser, dashboard };
  } catch (error) {
    if (isApiResponseError(error)) {
      if (error.status === 401) {
        return { kind: "expired_session", user: dashboardUser, status: 401, code: sanitizeAmbassadorDashboardDiagnostic(error.code) };
      }

      return {
        kind: "unavailable",
        user: dashboardUser,
        status: error.status,
        code: sanitizeAmbassadorDashboardDiagnostic(error.code),
        source: sanitizeAmbassadorDashboardDiagnostic(error.source),
        message: sanitizeAmbassadorDashboardDiagnostic(error.message),
      };
    }

    return {
      kind: "unavailable",
      user: dashboardUser,
      status: 500,
      code: null,
      source: null,
      message: sanitizeAmbassadorDashboardDiagnostic(error instanceof Error ? error.message : null),
    };
  }
};
