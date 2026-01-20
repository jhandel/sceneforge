import { Circle, Square, Crosshair } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  isPicking: boolean;
  isPaused: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePause: () => void;
  onStartPicker: () => void;
}

export function RecordingControls({
  isRecording,
  isPicking,
  isPaused,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onStartPicker,
}: RecordingControlsProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2">
        {/* Record Button */}
        {isRecording ? (
          <>
            <button
              onClick={onStopRecording}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              <Square className="w-4 h-4" />
              <span className="text-sm font-medium">Stop</span>
            </button>
            <button
              onClick={onTogglePause}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                isPaused
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-amber-500 text-white hover:bg-amber-600"
              }`}
            >
              <span className="text-sm font-medium">
                {isPaused ? "Resume" : "Pause"}
              </span>
            </button>
          </>
        ) : (
          <button
            onClick={onStartRecording}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            <Circle className="w-4 h-4 fill-current" />
            <span className="text-sm font-medium">Record</span>
          </button>
        )}

        {/* Picker Button */}
        <button
          onClick={onStartPicker}
          disabled={isPicking}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
            isPicking
              ? "bg-primary-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span className="text-sm font-medium">
            {isPicking ? "Picking..." : "Pick Element"}
          </span>
        </button>

        {/* Status indicator */}
        {isRecording && (
          <div
            className={`ml-auto flex items-center gap-2 text-sm ${
              isPaused ? "text-amber-600" : "text-red-600"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
              }`}
            />
            {isPaused ? "Paused" : "Recording"}
          </div>
        )}
      </div>
    </div>
  );
}
