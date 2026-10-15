import { useRef, useState } from "react";
import type { Vec3 } from "../models";
import { useT } from "../i18n";

export function ArrayPreview({
  points,
  length,
  width,
  target,
  rectangle,
  onSize,
  onTarget,
}: {
  points: Vec3[];
  length: number;
  width: number;
  target: Vec3;
  rectangle: boolean;
  onSize?: (axis: 0 | 1, value: number) => void;
  onTarget: (value: Vec3) => void;
}) {
  const t = useT(),
    svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "x" | "y" | "target"; scale: number } | null>(null);
  const [dragScale, setDragScale] = useState<number | null>(null);
  const scale =
    dragScale ??
    300 / Math.max(length, width, Math.abs(target[0]) * 2, Math.abs(target[1]) * 2, 0.5);
  const x = (n: number) => 220 + n * scale,
    y = (n: number) => 195 - n * scale;
  const begin = (e: React.PointerEvent<SVGElement>, kind: "x" | "y" | "target") => {
    e.preventDefault();
    setDragScale(scale);
    drag.current = { kind, scale };
    svg.current?.setPointerCapture(e.pointerId);
  };
  return (
    <section className="array-preview">
      <h4>
        {t("arrayPreview")} · {points.length} {t("cameras")}
      </h4>
      <svg
        ref={svg}
        viewBox="0 0 440 390"
        role="img"
        aria-label={t("arrayPreview")}
        onPointerMove={(e) => {
          if (!drag.current || !svg.current) return;
          const matrix = svg.current.getScreenCTM();
          if (!matrix) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
          const px = (p.x - 220) / drag.current.scale,
            py = (195 - p.y) / drag.current.scale;
          if (drag.current.kind === "target")
            onTarget([Math.round(px * 100) / 100, Math.round(py * 100) / 100, target[2]]);
          else
            onSize?.(
              drag.current.kind === "x" ? 0 : 1,
              Math.min(
                1000,
                Math.max(
                  0.1,
                  Math.round(Math.abs(drag.current.kind === "x" ? px : py) * 20) / 10,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragScale(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragScale(null);
        }}
      >
        <rect x="1" y="1" width="438" height="388" rx="12" fill="#f0f5f4" />
        <path d="M20 195H420M220 30V365" stroke="#cad7d4" strokeDasharray="4 4" />
        <rect
          x={x(-length / 2)}
          y={y(width / 2)}
          width={length * scale}
          height={width * scale}
          fill="none"
          stroke="#789d92"
          strokeWidth="1.5"
        />
        <text x="220" y={y(width / 2) - 15} textAnchor="middle">
          {length.toFixed(2)} m
        </text>
        <text
          x={x(length / 2) + 32}
          y="195"
          textAnchor="middle"
          transform={`rotate(90 ${x(length / 2) + 32} 195)`}
        >
          {width.toFixed(2)} m
        </text>
        {points.map((p, i) => {
          const corner =
            rectangle &&
            Math.abs(Math.abs(p[0]) - length / 2) < 1e-6 &&
            Math.abs(Math.abs(p[1]) - width / 2) < 1e-6;
          return (
            <g key={i}>
              <circle
                cx={x(p[0])}
                cy={y(p[1])}
                r={corner ? 6 : 4}
                fill={corner ? "#d28e42" : "#367e6e"}
              >
                <title>
                  {i + 1}
                  {corner ? ` · ${t("arrayCorner")}` : ""}
                </title>
              </circle>
              <text x={x(p[0]) + 7} y={y(p[1]) - 7} fontSize="10">
                {i + 1}
              </text>
            </g>
          );
        })}
        {onSize && (
          <>
            <rect
              aria-label={t("arrayLength")}
              className="array-drag-handle"
              x={x(length / 2) - 6}
              y={y(0) - 6}
              width="12"
              height="12"
              onPointerDown={(e) => begin(e, "x")}
            />
            <rect
              aria-label={t("arrayWidth")}
              className="array-drag-handle"
              x={x(0) - 6}
              y={y(width / 2) - 6}
              width="12"
              height="12"
              onPointerDown={(e) => begin(e, "y")}
            />
          </>
        )}
        <g
          className="array-target"
          onPointerDown={(e) => begin(e, "target")}
          aria-label={t("target")}
        >
          <circle cx={x(target[0])} cy={y(target[1])} r="14" fill="transparent" />
          <path
            d={`M${x(target[0]) - 10} ${y(target[1])}h20M${x(target[0])} ${y(target[1]) - 10}v20`}
            stroke="#c66740"
            strokeWidth="2"
          />
          <text x={x(target[0]) + 12} y={y(target[1]) + 17}>
            {t("target")}
          </text>
        </g>
      </svg>
      <p className="muted tiny">{t("arrayPreviewHint")}</p>
    </section>
  );
}
