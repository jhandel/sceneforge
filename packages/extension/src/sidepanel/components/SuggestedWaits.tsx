import type { SuggestedWait } from "../../shared/messages";
import { CollapsibleSection } from "./CollapsibleSection";

interface SuggestedWaitsProps {
  waits: SuggestedWait[];
  onAdd: (wait: SuggestedWait) => void;
  onClear: () => void;
}

export function SuggestedWaits({ waits, onAdd, onClear }: SuggestedWaitsProps) {
  if (waits.length === 0) {
    return null;
  }

  return (
    <CollapsibleSection
      title="Suggested Waits"
      defaultOpen
      badge={waits.length}
      actions={
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
      }
      contentClassName="space-y-2"
    >
      <div className="space-y-2">
        {waits.map((wait, index) => (
          <div
            key={`${wait.type}-${wait.value}-${index}`}
            className="border border-gray-100 rounded-md p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-gray-500">
                  {wait.type} · {Math.round(wait.confidence * 100)}%
                </p>
                <p className="text-sm text-gray-800">{wait.description}</p>
                <p className="text-xs text-gray-500 truncate">
                  {wait.value}
                </p>
              </div>
              <button
                onClick={() => onAdd(wait)}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
