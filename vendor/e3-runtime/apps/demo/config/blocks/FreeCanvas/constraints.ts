import type { FreeCanvasDevice } from "../../lib/free-canvas-bridge";

export const FREE_CANVAS_MIN_WIDTH = 280;
// A single landing-page canvas must accommodate a complete responsive page.
// Keep the bound finite so malformed facts cannot create an unbounded surface.
export const FREE_CANVAS_MAX_HEIGHT = 8192;
export const FREE_CANVAS_MIN_HEIGHT = 64;

const deviceContentWidths: Record<FreeCanvasDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 360,
};

export const getFreeCanvasMaxWidth = (device: FreeCanvasDevice) =>
  deviceContentWidths[device];

export const clampFreeCanvasWidth = (
  value: number,
  device: FreeCanvasDevice = "desktop"
) =>
  Math.round(
    Math.min(
      Math.max(Number.isFinite(value) ? value : FREE_CANVAS_MIN_WIDTH, FREE_CANVAS_MIN_WIDTH),
      getFreeCanvasMaxWidth(device)
    )
  );

export const clampFreeCanvasHeight = (value: number) =>
  Math.round(
    Math.min(
      Math.max(Number.isFinite(value) ? value : FREE_CANVAS_MIN_HEIGHT, FREE_CANVAS_MIN_HEIGHT),
      FREE_CANVAS_MAX_HEIGHT
    )
  );
