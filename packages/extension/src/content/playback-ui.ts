/**
 * Playback progress UI - shows what step/action is being executed during playback.
 */

const PlaybackIds = {
  OVERLAY: "demo-yaml-playback-overlay",
  PANEL: "demo-yaml-playback-panel",
} as const;

interface PlaybackState {
  isVisible: boolean;
  currentAction: number;
  totalActions: number;
  currentActionText: string;
  status: "running" | "success" | "error" | "waiting";
  errorMessage?: string;
}

// Store state on window to survive re-injection
const windowWithState = window as Window & { __demoPlaybackState?: PlaybackState };
if (!windowWithState.__demoPlaybackState) {
  windowWithState.__demoPlaybackState = {
    isVisible: false,
    currentAction: 0,
    totalActions: 0,
    currentActionText: "",
    status: "running",
  };
}
const playbackState = windowWithState.__demoPlaybackState;

/**
 * Gets or creates the playback overlay.
 */
function getOrCreateOverlay(): HTMLDivElement {
  let overlay = document.getElementById(PlaybackIds.OVERLAY) as HTMLDivElement;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = PlaybackIds.OVERLAY;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483646;
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Gets or creates the playback panel.
 */
function getOrCreatePanel(): HTMLDivElement {
  const overlay = getOrCreateOverlay();
  let panel = document.getElementById(PlaybackIds.PANEL) as HTMLDivElement;

  if (!panel) {
    panel = document.createElement("div");
    panel.id = PlaybackIds.PANEL;
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      min-width: 400px;
      max-width: 600px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      display: none;
      z-index: 2147483647;
    `;
    overlay.appendChild(panel);
  }

  return panel;
}

/**
 * Updates the panel content based on current state.
 */
function updatePanelContent(): void {
  const panel = getOrCreatePanel();

  const statusColors = {
    running: "#3b82f6",
    success: "#22c55e",
    error: "#ef4444",
    waiting: "#f59e0b",
  };

  const statusIcons = {
    running: "▶️",
    success: "✅",
    error: "❌",
    waiting: "⏳",
  };

  const statusText = {
    running: "Running",
    success: "Complete",
    error: "Failed",
    waiting: "Waiting",
  };

  const progressPercent = playbackState.totalActions > 0
    ? Math.round((playbackState.currentAction / playbackState.totalActions) * 100)
    : 0;

  panel.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
      <span style="font-size: 20px;">${statusIcons[playbackState.status]}</span>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 2px;">
          Playback ${statusText[playbackState.status]}
        </div>
        <div style="font-size: 12px; color: #9ca3af;">
          Action ${playbackState.currentAction} of ${playbackState.totalActions}
        </div>
      </div>
      <div style="
        background: ${statusColors[playbackState.status]};
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
      ">
        ${progressPercent}%
      </div>
    </div>

    <div style="
      background: #374151;
      border-radius: 6px;
      height: 6px;
      overflow: hidden;
      margin-bottom: 12px;
    ">
      <div style="
        background: ${statusColors[playbackState.status]};
        height: 100%;
        width: ${progressPercent}%;
        transition: width 0.3s ease;
      "></div>
    </div>

    <div style="
      background: #374151;
      padding: 10px 14px;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 12px;
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
    ">
      ${playbackState.status === "error" && playbackState.errorMessage
        ? `<span style="color: #fca5a5;">${escapeHtml(playbackState.errorMessage)}</span>`
        : `<span style="color: #d1d5db;">${escapeHtml(playbackState.currentActionText)}</span>`
      }
    </div>

    ${playbackState.status === "error" ? `
      <div style="margin-top: 12px; text-align: center;">
        <button id="demo-playback-close" style="
          background: #4b5563;
          color: white;
          border: none;
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          font-family: system-ui, -apple-system, sans-serif;
        ">Close</button>
      </div>
    ` : ""}
  `;

  // Add close button handler
  const closeBtn = panel.querySelector("#demo-playback-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      hidePlaybackUI();
    });
  }
}

/**
 * Escapes HTML to prevent XSS.
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Shows the playback UI.
 */
export function showPlaybackUI(totalActions: number): void {
  playbackState.isVisible = true;
  playbackState.totalActions = totalActions;
  playbackState.currentAction = 0;
  playbackState.currentActionText = "Starting playback...";
  playbackState.status = "running";
  playbackState.errorMessage = undefined;

  const panel = getOrCreatePanel();
  panel.style.display = "block";
  updatePanelContent();
}

/**
 * Updates the playback progress.
 */
export function updatePlaybackProgress(
  actionIndex: number,
  actionText: string,
  status: "running" | "waiting" = "running"
): void {
  playbackState.currentAction = actionIndex;
  playbackState.currentActionText = actionText;
  playbackState.status = status;
  updatePanelContent();
}

/**
 * Shows playback success.
 */
export function showPlaybackSuccess(): void {
  playbackState.status = "success";
  playbackState.currentActionText = "All actions completed successfully!";
  updatePanelContent();

  // Auto-hide after 2 seconds on success
  setTimeout(() => {
    hidePlaybackUI();
  }, 2000);
}

/**
 * Shows playback error.
 */
export function showPlaybackError(actionIndex: number, actionText: string, error: string): void {
  playbackState.currentAction = actionIndex;
  playbackState.currentActionText = actionText;
  playbackState.status = "error";
  playbackState.errorMessage = error;
  updatePanelContent();
}

/**
 * Hides the playback UI.
 */
export function hidePlaybackUI(): void {
  playbackState.isVisible = false;
  const panel = document.getElementById(PlaybackIds.PANEL);
  if (panel) {
    panel.style.display = "none";
  }
}

/**
 * Formats an action for display.
 */
export function formatActionText(action: { action: string; target?: { selector?: string }; text?: string; file?: string; waitFor?: { type: string; value?: string }; duration?: number }): string {
  switch (action.action) {
    case "click":
      return `Click: ${action.target?.selector?.slice(0, 60) || "unknown"}`;
    case "type":
      return `Type: "${action.text?.slice(0, 30) || ""}" into ${action.target?.selector?.slice(0, 30) || "unknown"}`;
    case "upload":
      return `Upload: ${action.file || "unknown file"}`;
    case "wait":
      if (action.waitFor) {
        return `Wait for ${action.waitFor.type}: "${action.waitFor.value?.slice(0, 40) || ""}"`;
      }
      return `Wait: ${action.duration || 0}ms`;
    case "scroll":
      return `Scroll page`;
    case "navigate":
      return `Navigate to path`;
    case "hover":
      return `Hover: ${action.target?.selector?.slice(0, 60) || "unknown"}`;
    default:
      return `${action.action}`;
  }
}
