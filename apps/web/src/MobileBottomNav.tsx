export type MobileDestination = "workspace" | "agent" | "code" | "changes" | "more";

interface MobileBottomNavProps {
  active: MobileDestination;
  onSelect: (destination: MobileDestination) => void;
}

const destinations: Array<{ id: MobileDestination; icon: string; label: string }> = [
  { id: "workspace", icon: "⌂", label: "工作区" },
  { id: "agent", icon: "✦", label: "Agent" },
  { id: "code", icon: "⌘", label: "代码" },
  { id: "changes", icon: "⇄", label: "变更" },
  { id: "more", icon: "•••", label: "更多" },
];

export function MobileBottomNav({ active, onSelect }: MobileBottomNavProps) {
  return <nav className="mobile-bottom-nav" aria-label="手机主导航">
    {destinations.map((destination) => <button
      key={destination.id}
      type="button"
      aria-current={active === destination.id ? "page" : undefined}
      onClick={() => onSelect(destination.id)}
    >
      <span aria-hidden="true">{destination.icon}</span>
      <small>{destination.label}</small>
    </button>)}
  </nav>;
}
