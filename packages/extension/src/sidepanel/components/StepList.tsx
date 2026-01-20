import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Trash2, ChevronDown, ChevronRight, Play, Loader2 } from "lucide-react";
import type { DemoDefinition, DemoStep, DemoAction } from "../../shared/types";
import { createEmptyStep } from "../../shared/yaml-serializer";
import { ActionEditor } from "./ActionEditor";

interface StepListProps {
  demo: DemoDefinition;
  selectedStepIndex: number;
  onSelectStep: (index: number) => void;
  onDemoChange: (demo: DemoDefinition) => void;
}

export function StepList({
  demo,
  selectedStepIndex,
  onSelectStep,
  onDemoChange,
}: StepListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const activeType = args.active.data.current?.type;
    if (activeType === "action") {
      const actionContainers = args.droppableContainers.filter((container) => {
        const type = container.data.current?.type;
        return type === "action" || type === "action-container";
      });
      return closestCenter({ ...args, droppableContainers: actionContainers });
    }
    if (activeType === "step") {
      const stepContainers = args.droppableContainers.filter((container) => {
        const type = container.data.current?.type;
        return type === "step";
      });
      return closestCenter({ ...args, droppableContainers: stepContainers });
    }
    return closestCenter(args);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === "step") {
      if (overType !== "step" || active.id === over.id) return;
      const oldIndex = demo.steps.findIndex((s) => s.id === active.id);
      const newIndex = demo.steps.findIndex((s) => s.id === over.id);

      const newSteps = arrayMove(demo.steps, oldIndex, newIndex);
      onDemoChange({ ...demo, steps: newSteps });

      // Update selected index
      if (selectedStepIndex === oldIndex) {
        onSelectStep(newIndex);
      }
      return;
    }

    if (activeType === "action") {
      if (overType !== "action" && overType !== "action-container") return;
      const activeStepIndex = active.data.current?.stepIndex as number | undefined;
      const activeActionIndex = active.data.current?.actionIndex as number | undefined;
      if (activeStepIndex === undefined || activeActionIndex === undefined) return;

      const overStepIndex = over.data.current?.stepIndex as number | undefined;
      if (overStepIndex === undefined) return;

      const targetIndex =
        overType === "action"
          ? (over.data.current?.actionIndex as number | undefined)
          : demo.steps[overStepIndex]?.actions.length;

      if (targetIndex === undefined) return;

      if (activeStepIndex === overStepIndex) {
        if (activeActionIndex === targetIndex) return;
        const newSteps = [...demo.steps];
        const reordered = arrayMove(
          newSteps[activeStepIndex].actions,
          activeActionIndex,
          targetIndex
        );
        newSteps[activeStepIndex] = { ...newSteps[activeStepIndex], actions: reordered };
        onDemoChange({ ...demo, steps: newSteps });
        return;
      }

      const newSteps = [...demo.steps];
      const sourceActions = [...newSteps[activeStepIndex].actions];
      const [movedAction] = sourceActions.splice(activeActionIndex, 1);
      if (!movedAction) return;

      const destinationActions = [...newSteps[overStepIndex].actions];
      const insertIndex = Math.min(targetIndex, destinationActions.length);
      destinationActions.splice(insertIndex, 0, movedAction);

      newSteps[activeStepIndex] = { ...newSteps[activeStepIndex], actions: sourceActions };
      newSteps[overStepIndex] = { ...newSteps[overStepIndex], actions: destinationActions };
      onDemoChange({ ...demo, steps: newSteps });
    }
  };

  const addStep = () => {
    const newStep = createEmptyStep(`step-${demo.steps.length + 1}`);
    onDemoChange({ ...demo, steps: [...demo.steps, newStep] });
    onSelectStep(demo.steps.length);
  };

  const deleteStep = (index: number) => {
    const newSteps = demo.steps.filter((_, i) => i !== index);
    onDemoChange({ ...demo, steps: newSteps });
    if (selectedStepIndex >= newSteps.length) {
      onSelectStep(Math.max(0, newSteps.length - 1));
    }
  };

  const updateStep = (index: number, updates: Partial<DemoStep>) => {
    const newSteps = [...demo.steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onDemoChange({ ...demo, steps: newSteps });
  };

  const updateStepActions = (stepIndex: number, actions: DemoAction[]) => {
    const newSteps = [...demo.steps];
    newSteps[stepIndex] = { ...newSteps[stepIndex], actions };
    onDemoChange({ ...demo, steps: newSteps });
  };

  const splitStepAtAction = (stepIndex: number, actionIndex: number) => {
    const step = demo.steps[stepIndex];
    if (!step || actionIndex >= step.actions.length - 1) return;

    // Create two new steps from the split
    const firstHalfActions = step.actions.slice(0, actionIndex + 1);
    const secondHalfActions = step.actions.slice(actionIndex + 1);

    // Update the current step with first half
    const updatedCurrentStep = {
      ...step,
      actions: firstHalfActions,
    };

    // Create new step with second half
    const newStep = createEmptyStep(`${step.id}-continued`);
    newStep.actions = secondHalfActions;
    newStep.script = ""; // Empty script for the new step

    // Insert new step after current one
    const newSteps = [...demo.steps];
    newSteps[stepIndex] = updatedCurrentStep;
    newSteps.splice(stepIndex + 1, 0, newStep);

    onDemoChange({ ...demo, steps: newSteps });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">Steps</h2>
        <button
          onClick={addStep}
          className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Step
        </button>
      </div>

      {demo.steps.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-6 text-center">
          <p className="text-sm text-gray-500 mb-2">No steps yet</p>
          <button
            onClick={addStep}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Add your first step
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={demo.steps.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {demo.steps.map((step, index) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={index}
                  isSelected={index === selectedStepIndex}
                  onSelect={() => onSelectStep(index)}
                  onDelete={() => deleteStep(index)}
                  onUpdate={(updates) => updateStep(index, updates)}
                  onActionsChange={(actions) => updateStepActions(index, actions)}
                  onSplitAtAction={(actionIndex) => splitStepAtAction(index, actionIndex)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface SortableStepProps {
  step: DemoStep;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<DemoStep>) => void;
  onActionsChange: (actions: DemoAction[]) => void;
  onSplitAtAction: (actionIndex: number) => void;
}

function SortableStep({
  step,
  index,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onActionsChange,
  onSplitAtAction,
}: SortableStepProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlayingStep, setIsPlayingStep] = useState(false);
  const [playingActionIndex, setPlayingActionIndex] = useState(-1);
  const [draftStepId, setDraftStepId] = useState(step.id);

  useEffect(() => {
    setDraftStepId(step.id);
  }, [step.id]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id, data: { type: "step", stepIndex: index } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const playStep = async () => {
    if (isPlayingStep) return;
    setIsPlayingStep(true);
    setPlayingActionIndex(0);

    try {
      // Use PLAY_STEP to trigger progress UI in content script
      const result = await chrome.runtime.sendMessage({
        type: "PLAY_STEP",
        actions: step.actions,
        stepId: step.id,
      });

      if (result.success) {
        console.log(`[sidepanel] Step completed successfully: ${result.completedActions}/${result.totalActions} actions`);
      } else {
        console.error(`[sidepanel] Step failed at action ${(result.failedActionIndex ?? 0) + 1}:`, result.error);
        console.error(`[sidepanel] Failed action: ${result.failedActionText}`);
      }
    } catch (error) {
      console.error(`[sidepanel] Step playback error:`, error);
    }

    setPlayingActionIndex(-1);
    setIsPlayingStep(false);
  };

  const commitStepId = (nextId: string) => {
    const trimmed = nextId.trim();
    if (!trimmed) {
      setDraftStepId(step.id);
      return;
    }

    if (trimmed !== step.id) {
      onUpdate({ id: trimmed });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border ${
        isSelected ? "border-primary-300 ring-2 ring-primary-100" : "border-gray-200"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      {/* Step Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onSelect}
      >
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-gray-400 hover:text-gray-600 cursor-grab"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand();
          }}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 mr-2">#{index + 1}</span>
          <span className="text-sm font-medium text-gray-700">{step.id}</span>
          <span className="text-xs text-gray-400 ml-2">
            ({step.actions.length} actions)
            {isPlayingStep && ` - Playing ${playingActionIndex + 1}/${step.actions.length}`}
          </span>
        </div>

        {/* Play Step button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            playStep();
          }}
          disabled={isPlayingStep || step.actions.length === 0}
          className={`p-1 ${isPlayingStep ? "text-gray-300" : "text-gray-400 hover:text-green-500"}`}
          title="Play all actions in this step"
        >
          {isPlayingStep ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-gray-400 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Step Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* Step ID */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Step ID</label>
            <input
              type="text"
              value={draftStepId}
              onChange={(e) => setDraftStepId(e.target.value)}
              onBlur={() => commitStepId(draftStepId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitStepId(draftStepId);
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraftStepId(step.id);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Script (Voiceover) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Script (Voiceover)
            </label>
            <textarea
              value={step.script}
              onChange={(e) => onUpdate({ script: e.target.value })}
              placeholder="Enter the voiceover text for this step..."
              rows={3}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Actions */}
          <ActionEditor
            actions={step.actions}
            stepIndex={index}
            onChange={onActionsChange}
            onSplitAt={onSplitAtAction}
          />
        </div>
      )}
    </div>
  );
}
