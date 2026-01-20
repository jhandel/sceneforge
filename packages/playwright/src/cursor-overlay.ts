import type { Page } from "@playwright/test";

/**
 * CSS for the custom cursor overlay.
 * Features:
 * - Large red arrow cursor visible on dark and light backgrounds
 * - Click ripple animation
 * - Smooth movement transitions
 * - Element highlight ring
 */
const CURSOR_STYLES = `
  /* Hide the real cursor when demo cursor is active */
  html.demo-cursor-active, html.demo-cursor-active * {
    cursor: none !important;
  }

  /* Demo cursor container */
  #demo-cursor {
    position: fixed;
    pointer-events: none;
    z-index: 999999;
    will-change: left, top;
  }

  /* Cursor arrow SVG - larger for visibility */
  #demo-cursor-arrow {
    width: 32px;
    height: 32px;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
  }

  /* Click ripple effect - larger and more visible */
  .demo-click-ripple {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(239, 68, 68, 0.7) 0%, rgba(239, 68, 68, 0.3) 40%, rgba(239, 68, 68, 0) 70%);
    transform: translate(-50%, -50%) scale(0);
    animation: demo-ripple 0.5s ease-out forwards;
    pointer-events: none;
  }

  @keyframes demo-ripple {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.5);
      opacity: 0;
    }
  }

  /* Highlight ring for elements being clicked - thicker and more visible */
  .demo-highlight-ring {
    position: fixed;
    border: 3px solid rgba(239, 68, 68, 0.9);
    border-radius: 6px;
    pointer-events: none;
    z-index: 999998;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.3), inset 0 0 0 1px rgba(239, 68, 68, 0.2);
    animation: demo-highlight-pulse 0.8s ease-out forwards;
  }

  @keyframes demo-highlight-pulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.03);
    }
    100% {
      opacity: 0;
      transform: scale(1.08);
    }
  }

  /* Trail effect for cursor movement */
  .demo-cursor-trail {
    position: fixed;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.4);
    pointer-events: none;
    z-index: 999998;
    animation: demo-trail-fade 0.3s ease-out forwards;
  }

  @keyframes demo-trail-fade {
    0% {
      opacity: 0.6;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(0.5);
    }
  }
`;

/**
 * SVG cursor arrow (red with white outline for visibility)
 */
const CURSOR_SVG = `
  <svg id="demo-cursor-arrow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3L10.5 21L13 13L21 10.5L3 3Z" fill="#ef4444" stroke="white" stroke-width="2" stroke-linejoin="round"/>
  </svg>
`;

const NAME_HELPER_SCRIPT = `
(() => {
  if (typeof window.__name !== "function") {
    window.__name = (target, value) => {
      try {
        Object.defineProperty(target, "name", { value, configurable: true });
      } catch {
        // Ignore failures setting function names.
      }
      return target;
    };
  }
})();
`;

const nameHelperInstalled = new WeakSet<Page>();

interface DemoCursorAPI {
  setPosition: (x: number, y: number) => void;
  click: () => void;
  highlight: (rect: { x: number; y: number; width: number; height: number }) => void;
  addTrail: (x: number, y: number) => void;
  destroy: () => void;
}

async function ensureNameHelper(page: Page): Promise<void> {
  if (!nameHelperInstalled.has(page)) {
    await page.addInitScript({ content: NAME_HELPER_SCRIPT });
    nameHelperInstalled.add(page);
  }
  await page.addScriptTag({ content: NAME_HELPER_SCRIPT });
}

/**
 * Injects the demo cursor overlay into the page.
 * Call this once after page load.
 */
export async function injectCursorOverlay(page: Page): Promise<void> {
  await ensureNameHelper(page);
  await page.addStyleTag({ content: CURSOR_STYLES });

  await page.evaluate((cursorSvg) => {
    // Create cursor container
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML = cursorSvg;
    cursor.style.left = "-100px";
    cursor.style.top = "-100px";
    document.body.appendChild(cursor);

    // Enable demo cursor mode
    document.documentElement.classList.add("demo-cursor-active");

    // Expose functions to window for Playwright to call
    (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor = {
      setPosition: (x: number, y: number) => {
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
      },
      click: () => {
        const ripple = document.createElement("div");
        ripple.className = "demo-click-ripple";
        cursor.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      },
      highlight: (rect: { x: number; y: number; width: number; height: number }) => {
        const ring = document.createElement("div");
        ring.className = "demo-highlight-ring";
        ring.style.left = `${rect.x}px`;
        ring.style.top = `${rect.y}px`;
        ring.style.width = `${rect.width}px`;
        ring.style.height = `${rect.height}px`;
        document.body.appendChild(ring);
        setTimeout(() => ring.remove(), 800);
      },
      addTrail: (x: number, y: number) => {
        const trail = document.createElement("div");
        trail.className = "demo-cursor-trail";
        trail.style.left = `${x}px`;
        trail.style.top = `${y}px`;
        document.body.appendChild(trail);
        setTimeout(() => trail.remove(), 300);
      },
      destroy: () => {
        cursor.remove();
        document.documentElement.classList.remove("demo-cursor-active");
        // Clean up any remaining trails or highlights
        document.querySelectorAll(".demo-cursor-trail, .demo-highlight-ring, .demo-click-ripple").forEach(el => el.remove());
      },
    };
  }, CURSOR_SVG);
}

/**
 * Smoothly moves the demo cursor to specified coordinates using actual mouse movement.
 * This creates a visible animation in the recorded video.
 */
export async function moveCursorTo(
  page: Page,
  x: number,
  y: number,
  options?: { steps?: number; trailEnabled?: boolean }
): Promise<void> {
  const steps = options?.steps ?? 15;
  const trailEnabled = options?.trailEnabled ?? true;

  // Get current cursor position
  const currentPos = await page.evaluate(() => {
    const cursor = document.getElementById("demo-cursor");
    if (!cursor) return { x: 0, y: 0 };
    return {
      x: parseFloat(cursor.style.left) || 0,
      y: parseFloat(cursor.style.top) || 0,
    };
  });

  // If starting from off-screen, jump to a reasonable starting position
  if (currentPos.x < 0 || currentPos.y < 0) {
    currentPos.x = x > 100 ? x - 100 : 50;
    currentPos.y = y > 100 ? y - 100 : 50;
    await page.evaluate(
      ([startX, startY]) => {
        const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
        if (api) api.setPosition(startX, startY);
      },
      [currentPos.x, currentPos.y]
    );
    await page.waitForTimeout(50);
  }

  // Animate movement in steps with easing
  for (let i = 1; i <= steps; i++) {
    // Ease-out cubic for smooth deceleration
    const t = i / steps;
    const easeT = 1 - Math.pow(1 - t, 3);

    const newX = currentPos.x + (x - currentPos.x) * easeT;
    const newY = currentPos.y + (y - currentPos.y) * easeT;

    await page.evaluate(
      ({ posX, posY, addTrail }) => {
        const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
        if (api) {
          api.setPosition(posX, posY);
          // Add trail effect every few steps
          if (addTrail) {
            api.addTrail(posX + 4, posY + 4);
          }
        }
      },
      { posX: newX, posY: newY, addTrail: trailEnabled && i % 3 === 0 }
    );

    await page.waitForTimeout(20);
  }

  // Ensure final position is exact
  await page.evaluate(
    ([finalX, finalY]) => {
      const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
      if (api) api.setPosition(finalX, finalY);
    },
    [x, y]
  );

  // Also move the actual mouse to ensure hover states work
  await page.mouse.move(x, y);

  // Brief pause at destination
  await page.waitForTimeout(100);
}

/**
 * Triggers the click ripple animation at the current cursor position.
 */
export async function triggerClickRipple(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
    if (api) {
      api.click();
    }
  });
  // Wait for ripple animation to be visible
  await page.waitForTimeout(150);
}

/**
 * Highlights an element with a pulsing ring effect.
 */
export async function highlightElement(page: Page, selector: string): Promise<void> {
  const boundingBox = await page.locator(selector).first().boundingBox();
  if (boundingBox) {
    await page.evaluate(
      (rect) => {
        const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
        if (api) {
          api.highlight(rect);
        }
      },
      {
        x: boundingBox.x - 6,
        y: boundingBox.y - 6,
        width: boundingBox.width + 12,
        height: boundingBox.height + 12,
      }
    );
  }
}

/**
 * Removes the demo cursor overlay.
 */
export async function removeCursorOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as Window & { __demoCursor?: DemoCursorAPI }).__demoCursor;
    if (api) {
      api.destroy();
    }
  });
}

/**
 * Performs a demo click action with visible cursor movement:
 * 1. Moves cursor smoothly to element center
 * 2. Optionally highlights element
 * 3. Triggers click ripple
 * 4. Performs actual click
 */
export async function demoClick(
  page: Page,
  selector: string,
  options?: {
    highlight?: boolean;
    delayAfter?: number;
    delayBefore?: number;
  }
): Promise<void> {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  await element.waitFor({ state: "visible", timeout: 10000 });

  const boundingBox = await element.boundingBox();
  if (!boundingBox) {
    throw new Error(`Element not found or not visible: ${selector}`);
  }

  // Calculate center of element
  const centerX = boundingBox.x + boundingBox.width / 2;
  const centerY = boundingBox.y + boundingBox.height / 2;

  // Optional delay before moving
  if (options?.delayBefore) {
    await page.waitForTimeout(options.delayBefore);
  }

  // Move cursor to element with smooth animation
  await moveCursorTo(page, centerX, centerY, { steps: 20 });

  // Optional highlight
  if (options?.highlight) {
    await highlightElement(page, selector);
    await page.waitForTimeout(200);
  }

  // Trigger click ripple
  await triggerClickRipple(page);

  // Perform actual click
  await element.click();

  // Wait for ripple animation to complete
  await page.waitForTimeout(200);

  // Optional delay after click
  if (options?.delayAfter) {
    await page.waitForTimeout(options.delayAfter);
  }
}

/**
 * Performs a demo hover action with visible cursor movement.
 */
export async function demoHover(
  page: Page,
  selector: string,
  options?: { highlight?: boolean }
): Promise<void> {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  await element.waitFor({ state: "visible", timeout: 10000 });

  const boundingBox = await element.boundingBox();
  if (!boundingBox) {
    throw new Error(`Element not found or not visible: ${selector}`);
  }

  const centerX = boundingBox.x + boundingBox.width / 2;
  const centerY = boundingBox.y + boundingBox.height / 2;

  await moveCursorTo(page, centerX, centerY, { steps: 15 });

  if (options?.highlight) {
    await highlightElement(page, selector);
  }

  await element.hover();
  await page.waitForTimeout(300);
}

/**
 * Types text with visible cursor at the input location.
 */
export async function demoType(
  page: Page,
  selector: string,
  text: string,
  options?: { highlight?: boolean; delayBetweenChars?: number }
): Promise<void> {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  await element.waitFor({ state: "visible", timeout: 10000 });

  const boundingBox = await element.boundingBox();
  if (!boundingBox) {
    throw new Error(`Element not found or not visible: ${selector}`);
  }

  const centerX = boundingBox.x + boundingBox.width / 2;
  const centerY = boundingBox.y + boundingBox.height / 2;

  await moveCursorTo(page, centerX, centerY);

  if (options?.highlight) {
    await highlightElement(page, selector);
    await page.waitForTimeout(150);
  }

  await triggerClickRipple(page);
  await element.click();
  await page.waitForTimeout(100);

  // Type with optional delay between characters
  await element.fill(text);
  await page.waitForTimeout(200);
}
