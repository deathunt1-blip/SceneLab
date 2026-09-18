import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
export function Num({
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit,
  disabled = false,
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const format = (n: number) => (Number.isFinite(n) ? String(Number(n.toFixed(4))) : "");
  const [text, setText] = useState(format(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(format(value));
  }, [value]);
  return (
    <div className="number-input">
      <input
        type="number"
        value={text}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => {
          const input = e.target.value;
          setText(input);
          if (input.trim() === "") return;
          const n = Number(input);
          if (Number.isFinite(n) && n >= (min ?? -Infinity) && n <= (max ?? Infinity))
            onChange(n);
        }}
        onBlur={() => {
          editing.current = false;
          const parsed = text.trim() === "" ? value : Number(text),
            n = Number.isFinite(parsed)
              ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed))
              : value;
          setText(format(n));
          if (n !== value) onChange(n);
        }}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        {...rest}
      />
      {unit && <span>{unit}</span>}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-label">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const t = useT();
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("closeDialog")}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(digits);
