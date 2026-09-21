export interface ViewportMetricsInput {
  layoutHeight: number;
  visualHeight?: number;
  offsetTop?: number;
  scale?: number;
}

export interface ViewportMetrics {
  appHeight: number;
  keyboardInset: number;
  keyboardOpen: boolean;
}

const KEYBOARD_THRESHOLD_PX = 80;
export const SINGLE_PANE_MEDIA = "(max-width: 768px), (orientation: landscape) and (max-height: 500px)";

export function computeViewportMetrics(input: ViewportMetricsInput): ViewportMetrics {
  const visualHeight = input.visualHeight ?? input.layoutHeight;
  const offsetTop = Math.max(0, input.offsetTop ?? 0);
  const scale = input.scale ?? 1;
  const unscaledInset = Math.max(0, input.layoutHeight - visualHeight - offsetTop);
  const keyboardInset = Math.abs(scale - 1) < 0.01 ? unscaledInset : 0;
  return { appHeight: Math.max(1, visualHeight), keyboardInset, keyboardOpen: keyboardInset >= KEYBOARD_THRESHOLD_PX };
}

export function installViewportEnvironment(root: HTMLElement, targetWindow: Window = window) {
  const viewport = targetWindow.visualViewport;
  const css = (targetWindow as Window & { CSS?: { supports: (property: string, value?: string) => boolean } }).CSS;
  root.dataset.visualViewport = viewport ? "available" : "fallback";
  root.dataset.dynamicViewport = css?.supports("height", "100dvh") ? "available" : "fallback";

  const update = () => {
    const metrics = computeViewportMetrics({ layoutHeight: targetWindow.innerHeight, visualHeight: viewport?.height, offsetTop: viewport?.offsetTop, scale: viewport?.scale });
    root.style.setProperty("--app-height", `${Math.round(metrics.appHeight)}px`);
    root.style.setProperty("--keyboard-inset", `${Math.round(metrics.keyboardInset)}px`);
    root.classList.toggle("virtual-keyboard-open", metrics.keyboardOpen);
  };

  update();
  targetWindow.addEventListener("resize", update);
  targetWindow.addEventListener("orientationchange", update);
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  return () => {
    targetWindow.removeEventListener("resize", update);
    targetWindow.removeEventListener("orientationchange", update);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    root.classList.remove("virtual-keyboard-open");
  };
}
