import { useState, useEffect, useCallback } from "react";
import type { DemoDefinition, RecordingState, PickerResult } from "../shared/types";
import type { ExtensionMessage } from "../shared/messages";
import { createEmptyDemo } from "../shared/yaml-serializer";
import { RecordingControls } from "./components/RecordingControls";
import { DemoMetadata } from "./components/DemoMetadata";
import { StepList } from "./components/StepList";
import { YAMLPreview } from "./components/YAMLPreview";

type Tab = "editor" | "yaml";

export function App() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPicking: false,
    currentDemo: null,
    currentStepIndex: -1,
  });
  const [activeTab, setActiveTab] = useState<Tab>("editor");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);

  // Load initial state
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response: RecordingState) => {
      if (response) {
        setState(response);
        // Sync selected step from service worker
        if (response.currentStepIndex >= 0) {
          setSelectedStepIndex(response.currentStepIndex);
        }
        if (!response.currentDemo) {
          // Initialize with empty demo
          const newDemo = createEmptyDemo();
          updateDemo(newDemo);
        }
      }
    });
  }, []);

  // Listen for state updates
  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      if (message.type === "STATE_UPDATE") {
        setState(message.state);
      } else if (message.type === "PICKER_RESULT") {
        handlePickerResult(message.result);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [selectedStepIndex, state.currentDemo]);

  // Update demo in service worker
  const updateDemo = useCallback((demo: DemoDefinition) => {
    chrome.runtime.sendMessage({ type: "UPDATE_DEMO", demo });
  }, []);

  // Handle picker result
  const handlePickerResult = useCallback(
    (result: PickerResult) => {
      if (!state.currentDemo) return;

      const demo = { ...state.currentDemo };
      const step = demo.steps[selectedStepIndex];
      if (!step) return;

      // Add click action with selected selector
      step.actions.push({
        action: "click",
        target: {
          type: "selector",
          selector: result.selector,
        },
        highlight: true,
      });

      updateDemo(demo);
    },
    [state.currentDemo, selectedStepIndex, updateDemo]
  );

  // Recording controls
  const handleStartRecording = useCallback(() => {
    chrome.runtime.sendMessage({ type: "START_RECORDING" });
  }, []);

  const handleStopRecording = useCallback(() => {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  }, []);

  const handleStartPicker = useCallback(() => {
    chrome.runtime.sendMessage({ type: "START_PICKER" });
  }, []);

  // Demo management
  const handleDemoChange = useCallback(
    (updates: Partial<DemoDefinition>) => {
      if (!state.currentDemo) return;
      const newDemo = { ...state.currentDemo, ...updates };
      updateDemo(newDemo);
    },
    [state.currentDemo, updateDemo]
  );

  const handleNewDemo = useCallback(() => {
    const newDemo = createEmptyDemo();
    updateDemo(newDemo);
    setSelectedStepIndex(0);
    chrome.runtime.sendMessage({ type: "SET_CURRENT_STEP", stepIndex: 0 });
  }, [updateDemo]);

  // Handle step selection - sync with service worker
  const handleSelectStep = useCallback((index: number) => {
    setSelectedStepIndex(index);
    chrome.runtime.sendMessage({ type: "SET_CURRENT_STEP", stepIndex: index });
  }, []);

  const demo = state.currentDemo || createEmptyDemo();

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Demo YAML Creator</h1>
          <button
            onClick={handleNewDemo}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            New Demo
          </button>
        </div>
      </header>

      {/* Recording Controls */}
      <RecordingControls
        isRecording={state.isRecording}
        isPicking={state.isPicking}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onStartPicker={handleStartPicker}
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab("editor")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "editor"
              ? "text-primary-600 border-b-2 border-primary-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab("yaml")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "yaml"
              ? "text-primary-600 border-b-2 border-primary-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          YAML Preview
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "editor" ? (
          <div className="h-full overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Demo Metadata */}
              <DemoMetadata demo={demo} onChange={handleDemoChange} />

              {/* Steps */}
              <StepList
                demo={demo}
                selectedStepIndex={selectedStepIndex}
                onSelectStep={handleSelectStep}
                onDemoChange={updateDemo}
              />
            </div>
          </div>
        ) : (
          <YAMLPreview demo={demo} onDemoChange={updateDemo} />
        )}
      </div>
    </div>
  );
}
