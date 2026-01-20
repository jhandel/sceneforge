import type { SelectorConfig } from "../../shared/types";
import { SELECTOR_STRATEGY_OPTIONS } from "../../shared/selector-config";
import { CollapsibleSection } from "./CollapsibleSection";

interface SelectorControlsProps {
  config: SelectorConfig;
  onChange: (config: SelectorConfig) => void;
}

export function SelectorControls({ config, onChange }: SelectorControlsProps) {
  const enabled = new Set(config.enabledStrategies);

  const toggleStrategy = (strategyId: string) => {
    const nextEnabled = SELECTOR_STRATEGY_OPTIONS.map((option) => option.id).filter(
      (id) => {
        if (id === strategyId) {
          return !enabled.has(id);
        }
        return enabled.has(id);
      }
    );

    if (nextEnabled.length === 0) {
      return;
    }

    onChange({ ...config, enabledStrategies: nextEnabled });
  };

  const resetToDefault = () => {
    onChange({
      ...config,
      enabledStrategies: SELECTOR_STRATEGY_OPTIONS.map((option) => option.id),
    });
  };

  return (
    <CollapsibleSection
      title="Selector Strategies"
      actions={
        <button
          type="button"
          onClick={resetToDefault}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Reset
        </button>
      }
    >
      <div className="space-y-2">
        {SELECTOR_STRATEGY_OPTIONS.map((option) => (
          <label
            key={option.id}
            className="flex items-start gap-2 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              checked={enabled.has(option.id)}
              onChange={() => toggleStrategy(option.id)}
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-xs text-gray-500">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
