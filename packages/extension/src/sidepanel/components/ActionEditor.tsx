import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Trash2,
  MousePointer,
  Type,
  Clock,
  Navigation,
  Upload,
  Eye,
  Move,
  ArrowDown,
  Target,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Scissors,
  Play,
  Loader2,
} from "lucide-react";
import type { DemoAction, ActionType, WaitCondition } from "../../shared/types";

interface ActionEditorProps {
  actions: DemoAction[];
  stepIndex: number;
  onChange: (actions: DemoAction[]) => void;
  onSplitAt?: (actionIndex: number) => void;
}

const ACTION_TYPES: { type: ActionType; label: string; icon: React.ReactNode }[] = [
  { type: "click", label: "Click", icon: <MousePointer className="w-3 h-3" /> },
  { type: "type", label: "Type", icon: <Type className="w-3 h-3" /> },
  { type: "wait", label: "Wait", icon: <Clock className="w-3 h-3" /> },
  { type: "navigate", label: "Navigate", icon: <Navigation className="w-3 h-3" /> },
  { type: "upload", label: "Upload", icon: <Upload className="w-3 h-3" /> },
  { type: "hover", label: "Hover", icon: <Eye className="w-3 h-3" /> },
  { type: "scroll", label: "Scroll", icon: <ArrowDown className="w-3 h-3" /> },
  { type: "scrollTo", label: "Scroll To", icon: <Target className="w-3 h-3" /> },
  { type: "drag", label: "Drag", icon: <Move className="w-3 h-3" /> },
];

export function ActionEditor({ actions, stepIndex, onChange, onSplitAt }: ActionEditorProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const containerId = `step-${stepIndex}`;
  const actionIds = actions.map((_, index) => `step-${stepIndex}-action-${index}`);
  const { setNodeRef, isOver } = useDroppable({
    id: containerId,
    data: { type: "action-container", stepIndex },
  });

  const addAction = (type: ActionType) => {
    const newAction: DemoAction = { action: type };

    // Set defaults based on type
    switch (type) {
      case "click":
      case "hover":
      case "scrollTo":
        newAction.target = { type: "selector", selector: "" };
        break;
      case "type":
        newAction.target = { type: "selector", selector: "" };
        newAction.text = "";
        break;
      case "wait":
        newAction.duration = 1000;
        break;
      case "navigate":
        newAction.path = "/";
        break;
      case "upload":
        // Upload doesn't require a target selector (CLI finds first file input automatically)
        // But we can optionally specify one if needed
        newAction.file = "";
        break;
      case "drag":
        newAction.target = { type: "selector", selector: "" };
        newAction.drag = { deltaX: 0, deltaY: 0 };
        break;
    }

    onChange([...actions, newAction]);
    setShowAddMenu(false);
  };

  const updateAction = (index: number, updates: Partial<DemoAction>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onChange(newActions);
  };

  const deleteAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">Actions</label>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-primary-600 hover:bg-primary-50 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[140px]">
              {ACTION_TYPES.map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => addAction(type)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={isOver ? "rounded ring-2 ring-primary-200" : undefined}
      >
        <SortableContext items={actionIds} strategy={verticalListSortingStrategy}>
          {actions.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded p-3 text-center">
              <p className="text-xs text-gray-400">No actions</p>
            </div>
          ) : (
            <div className="space-y-1">
              {actions.map((action, index) => (
                <SortableAction
                  key={`step-${stepIndex}-action-${index}`}
                  id={`step-${stepIndex}-action-${index}`}
                  stepIndex={stepIndex}
                  action={action}
                  index={index}
                  totalActions={actions.length}
                  onUpdate={(updates) => updateAction(index, updates)}
                  onDelete={() => deleteAction(index)}
                  onSplitAt={onSplitAt ? () => onSplitAt(index) : undefined}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

interface SortableActionProps {
  id: string;
  stepIndex: number;
  action: DemoAction;
  index: number;
  totalActions: number;
  onUpdate: (updates: Partial<DemoAction>) => void;
  onDelete: () => void;
  onSplitAt?: () => void;
}

function SortableAction({
  id,
  stepIndex,
  action,
  index,
  totalActions,
  onUpdate,
  onDelete,
  onSplitAt,
}: SortableActionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [testResult, setTestResult] = useState<{ found: boolean; count: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playResult, setPlayResult] = useState<{ success: boolean; error?: string } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "action", stepIndex, actionIndex: index } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const actionInfo = ACTION_TYPES.find((a) => a.type === action.action);

  const testSelector = async () => {
    if (!action.target?.selector) return;

    try {
      const result = await chrome.runtime.sendMessage({
        type: "TEST_SELECTOR",
        selector: action.target.selector,
      });
      setTestResult(result);

      // Highlight the element
      if (result.found) {
        chrome.runtime.sendMessage({
          type: "HIGHLIGHT_ELEMENT",
          selector: action.target.selector,
        });
      }
    } catch (error) {
      setTestResult({ found: false, count: 0 });
    }
  };

  const handlePlay = async () => {
    setIsPlaying(true);
    setPlayResult(null);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "PLAY_ACTION",
        action,
      });
      setPlayResult(result);
    } catch (error) {
      setPlayResult({ success: false, error: String(error) });
    } finally {
      setIsPlaying(false);
    }
  };

  const getActionSummary = () => {
    switch (action.action) {
      case "click":
      case "hover":
      case "scrollTo":
        return action.target?.selector?.slice(0, 30) || "No selector";
      case "type":
        return `"${action.text?.slice(0, 20) || ""}..."`;
      case "wait":
        if (action.duration) return `${action.duration}ms`;
        if (action.waitFor) return `for ${action.waitFor.type}`;
        return "";
      case "navigate":
        return action.path?.slice(0, 30) || "";
      case "upload":
        return action.file?.split("/").pop() || "No file";
      case "drag":
        return `(${action.drag?.deltaX}, ${action.drag?.deltaY})`;
      default:
        return "";
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-gray-50 rounded border border-gray-200 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 text-gray-400 hover:text-gray-600 cursor-grab"
        >
          <GripVertical className="w-3 h-3" />
        </button>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        <div className="flex items-center gap-1 text-gray-600">
          {actionInfo?.icon}
          <span className="text-xs font-medium">{actionInfo?.label}</span>
        </div>

        <span className="flex-1 text-xs text-gray-400 truncate ml-1">
          {getActionSummary()}
        </span>

        {/* Play button */}
        <button
          onClick={handlePlay}
          disabled={isPlaying}
          className={`p-0.5 ${isPlaying ? "text-gray-300" : "text-gray-400 hover:text-green-500"}`}
          title="Play this action"
        >
          {isPlaying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
        </button>

        {/* Split button - only show if there are actions after this one */}
        {onSplitAt && index < totalActions - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSplitAt();
            }}
            className="p-0.5 text-gray-400 hover:text-blue-500"
            title="Split step after this action"
          >
            <Scissors className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={onDelete}
          className="p-0.5 text-gray-400 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Play result indicator */}
      {playResult && (
        <div className={`px-2 py-1 text-xs ${playResult.success ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
          {playResult.success ? "Action played successfully" : `Error: ${playResult.error}`}
        </div>
      )}

      {isExpanded && (
        <div className="border-t border-gray-200 p-2 space-y-2">
          {/* Target selector fields */}
          {["click", "type", "hover", "scrollTo", "drag"].includes(action.action) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Selector</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={action.target?.selector || ""}
                  onChange={(e) =>
                    onUpdate({
                      target: {
                        type: "selector",
                        selector: e.target.value,
                      },
                    })
                  }
                  placeholder="CSS selector or Playwright locator"
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={testSelector}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Test
                </button>
              </div>
              {testResult && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${testResult.found ? "text-green-600" : "text-red-600"}`}>
                  {testResult.found ? (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      Found {testResult.count} element{testResult.count !== 1 ? "s" : ""}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" />
                      No elements found
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Type-specific fields */}
          {action.action === "type" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Text</label>
              <input
                type="text"
                value={action.text || ""}
                onChange={(e) => onUpdate({ text: e.target.value })}
                placeholder="Text to type"
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {action.action === "navigate" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Path</label>
              <input
                type="text"
                value={action.path || ""}
                onChange={(e) => onUpdate({ path: e.target.value })}
                placeholder="/app/quotes"
                className="w-full px-2 py-1 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {action.action === "wait" && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Duration (ms)</label>
                <input
                  type="number"
                  value={action.duration || ""}
                  onChange={(e) =>
                    onUpdate({
                      duration: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  placeholder="1000"
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div className="text-xs text-gray-400">- or -</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Wait For</label>
                  <select
                    value={action.waitFor?.type || ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        onUpdate({
                          duration: undefined,
                          waitFor: {
                            type: e.target.value as WaitCondition["type"],
                            value: action.waitFor?.value || "",
                            timeout: 15000,
                          },
                        });
                      } else {
                        onUpdate({ waitFor: undefined });
                      }
                    }}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">None</option>
                    <option value="text">Text visible</option>
                    <option value="textHidden">Text hidden</option>
                    <option value="selector">Selector visible</option>
                    <option value="selectorHidden">Selector hidden</option>
                    <option value="idle">Network idle</option>
                  </select>
                </div>
                {action.waitFor && action.waitFor.type !== "idle" && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Value</label>
                    <input
                      type="text"
                      value={action.waitFor.value || ""}
                      onChange={(e) =>
                        onUpdate({
                          waitFor: { ...action.waitFor!, value: e.target.value },
                        })
                      }
                      placeholder="Text or selector"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {action.action === "upload" && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">File Path</label>
                <input
                  type="text"
                  value={action.file || ""}
                  onChange={(e) => onUpdate({ file: e.target.value })}
                  placeholder="test_models/dxf/example.dxf"
                  className="w-full px-2 py-1 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Selector <span className="text-gray-400">(optional - defaults to first file input)</span>
                </label>
                <input
                  type="text"
                  value={action.target?.selector || ""}
                  onChange={(e) =>
                    onUpdate({
                      target: e.target.value
                        ? { type: "selector", selector: e.target.value }
                        : undefined,
                    })
                  }
                  placeholder='input[type="file"]'
                  className="w-full px-2 py-1 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </>
          )}

          {action.action === "drag" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Delta X</label>
                <input
                  type="number"
                  value={action.drag?.deltaX || 0}
                  onChange={(e) =>
                    onUpdate({
                      drag: { ...action.drag!, deltaX: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Delta Y</label>
                <input
                  type="number"
                  value={action.drag?.deltaY || 0}
                  onChange={(e) =>
                    onUpdate({
                      drag: { ...action.drag!, deltaY: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          )}

          {/* Highlight toggle for click actions */}
          {action.action === "click" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`highlight-${id}`}
                checked={action.highlight || false}
                onChange={(e) => onUpdate({ highlight: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor={`highlight-${id}`} className="text-xs text-gray-600">
                Highlight element before click
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
