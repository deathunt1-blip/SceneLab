import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
export function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, innerHeight - rect.height - 8)),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (event: Event) => {
      if (!el.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", onClose);
    };
  }, [x, y, onClose]);
  return (
    <div
      ref={ref}
      className="scene-context-menu"
      role="menu"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      {children}
    </div>
  );
}
