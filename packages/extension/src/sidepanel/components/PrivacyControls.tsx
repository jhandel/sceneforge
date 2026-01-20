import type { PrivacyConfig } from "../../shared/types";
import { CollapsibleSection } from "./CollapsibleSection";

interface PrivacyControlsProps {
  config: PrivacyConfig;
  onChange: (config: PrivacyConfig) => void;
}

function parseList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function PrivacyControls({ config, onChange }: PrivacyControlsProps) {
  return (
    <CollapsibleSection title="Privacy Controls">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={config.redactSensitiveInputs}
          onChange={(e) =>
            onChange({ ...config, redactSensitiveInputs: e.target.checked })
          }
        />
        Redact sensitive inputs (passwords, tokens, secrets)
      </label>

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Allowlist selectors (one per line)
        </label>
        <textarea
          value={config.allowlist.join("\n")}
          onChange={(e) => onChange({ ...config, allowlist: parseList(e.target.value) })}
          placeholder=".demo-form input\n[data-allow-recording]"
          rows={3}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Denylist selectors (one per line)
        </label>
        <textarea
          value={config.denylist.join("\n")}
          onChange={(e) => onChange({ ...config, denylist: parseList(e.target.value) })}
          placeholder={`input[type="password"]\n[data-private]`}
          rows={3}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
        />
      </div>
    </CollapsibleSection>
  );
}
