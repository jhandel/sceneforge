import type { PrivacyConfig } from "@jhandel/sceneforge-shared";

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  redactSensitiveInputs: true,
  allowlist: [],
  denylist: [],
};

export function normalizePrivacyConfig(value: unknown): PrivacyConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PRIVACY_CONFIG };
  }

  const record = value as Partial<PrivacyConfig>;
  const allowlist = Array.isArray(record.allowlist)
    ? record.allowlist.filter((item) => typeof item === "string")
    : [];
  const denylist = Array.isArray(record.denylist)
    ? record.denylist.filter((item) => typeof item === "string")
    : [];

  return {
    redactSensitiveInputs:
      typeof record.redactSensitiveInputs === "boolean"
        ? record.redactSensitiveInputs
        : DEFAULT_PRIVACY_CONFIG.redactSensitiveInputs,
    allowlist,
    denylist,
  };
}
