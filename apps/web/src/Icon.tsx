import type { SVGProps } from "react";

export type IconName =
  | "arrow-up" | "chevron-down" | "chevron-right" | "clock" | "code"
  | "copy" | "external" | "folder" | "help" | "menu" | "moon" | "more"
  | "panel" | "plus" | "search" | "settings" | "sparkles" | "sun"
  | "thumbs-down" | "thumbs-up" | "voice" | "x";

const paths: Record<IconName, React.ReactNode> = {
  "arrow-up": <><path d="M12 19V5"/><path d="m6.5 10.5 5.5-5.5 5.5 5.5"/></>,
  "chevron-down": <path d="m7 10 5 5 5-5"/>,
  "chevron-right": <path d="m9 6 6 6-6 6"/>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.5 2"/></>,
  code: <><path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/><path d="m13.5 5-3 14"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  external: <><path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
  folder: <path d="M3.5 7.5h6l1.6 2H20.5v8.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z"/>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.5 2.2c-.8.4-1.2.9-1.2 1.8"/><path d="M12 17h.01"/></>,
  menu: <><path d="M5 7h14M5 12h14M5 17h14"/></>,
  moon: <path d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8.5 8.5 0 1 0 19.5 15.2Z"/>,
  more: <><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  panel: <><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8.5 4v16"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a6 6 0 0 0-.7-1.6l.9-2-2.1-2.1-2 .9a6 6 0 0 0-1.6-.7l-.7-2h-3l-.7 2a6 6 0 0 0-1.6.7l-2-.9-2.1 2.1.9 2a6 6 0 0 0-.7 1.6l-2 .7v3l2 .7a6 6 0 0 0 .7 1.6l-.9 2 2.1 2.1 2-.9a6 6 0 0 0 1.6.7l.7 2h3l.7-2a6 6 0 0 0 1.6-.7l2 .9 2.1-2.1-.9-2a6 6 0 0 0 .7-1.6Z" transform="scale(.78) translate(3.4 3.4)"/></>,
  sparkles: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9Z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z"/></>,
  sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></>,
  "thumbs-down": <><path d="M7 13V4H4.8A1.8 1.8 0 0 0 3 5.8v5.4A1.8 1.8 0 0 0 4.8 13Z"/><path d="M7 5h7.8a2 2 0 0 1 1.9 1.4l1.7 5.2A1.8 1.8 0 0 1 16.7 14H13l.5 3.2a2.4 2.4 0 0 1-2.4 2.8L7 13"/></>,
  "thumbs-up": <><path d="M7 11v9H4.8A1.8 1.8 0 0 1 3 18.2v-5.4A1.8 1.8 0 0 1 4.8 11Z"/><path d="M7 19h7.8a2 2 0 0 0 1.9-1.4l1.7-5.2A1.8 1.8 0 0 0 16.7 10H13l.5-3.2A2.4 2.4 0 0 0 11.1 4L7 11"/></>,
  voice: <><rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6"/></>,
  x: <path d="m7 7 10 10M17 7 7 17"/>,
};

export function Icon({ name, size = 16, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
