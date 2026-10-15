import type { Settings } from "../models";
import { coverageSettings, MAX_COVERAGE_VIEWS } from "../simulation/coverage";
import { useT } from "../i18n";
import { Field, Num, Toggle } from "./Common";
import { coverageGradient } from "../renderer/coveragePalette";

export function CoverageControls({
  settings,
  onChange,
  displayOnly = false,
  hideThreshold = false,
  hidePalette = false,
}: {
  settings: Partial<Settings>;
  onChange: (patch: Partial<Settings>) => void;
  displayOnly?: boolean;
  hideThreshold?: boolean;
  hidePalette?: boolean;
}) {
  const t = useT(),
    c = coverageSettings(settings);
  return (
    <div className="coverage-settings">
      {!displayOnly && (
        <>
          <Field label={t("coverageBasis")}>
            <select
              aria-label={t("coverageBasis")}
              value={c.coverageBasis}
              onChange={(e) =>
                onChange({ coverageBasis: e.target.value as typeof c.coverageBasis })
              }
            >
              <option value="imaging">{t("basisImaging")}</option>
              <option value="trackingRange">{t("basisTracking")}</option>
            </select>
          </Field>
          {c.coverageBasis === "trackingRange" && (
            <>
              <Field label={t("trackingRangeSource")}>
                <select
                  aria-label={t("trackingRangeSource")}
                  value={c.trackingRangeSource}
                  onChange={(e) =>
                    onChange({
                      trackingRangeSource: e.target.value as typeof c.trackingRangeSource,
                      ...(e.target.value === "manual"
                        ? { trackingRangeOverrideM: c.trackingRangeOverrideM ?? 20 }
                        : {}),
                    })
                  }
                >
                  <option value="model">{t("rangeModel")}</option>
                  <option value="manual">{t("rangeManual")}</option>
                </select>
              </Field>
              {c.trackingRangeSource === "manual" ? (
                <Field label={t("trackingDistance")}>
                  <Num
                    aria-label={t("trackingDistance")}
                    value={c.trackingRangeOverrideM ?? 20}
                    min={0.1}
                    max={10000}
                    unit="m"
                    onChange={(n) => onChange({ trackingRangeOverrideM: n })}
                  />
                </Field>
              ) : (
                <p className="muted tiny">{t("rangeSnapshotHint")}</p>
              )}
              <p className="notice small">{t("trackingImagingHint")}</p>
            </>
          )}
        </>
      )}
      {!hideThreshold && (
        <Field label={t("coverageThreshold")}>
          <Num
            aria-label={t("coverageThreshold")}
            value={c.coverageThreshold}
            min={1}
            max={MAX_COVERAGE_VIEWS}
            step={1}
            unit="≥"
            onChange={(n) =>
              onChange({
                coverageThreshold: Math.round(n),
                coverageScaleMax: Math.max(c.coverageScaleMax, Math.round(n)),
              })
            }
          />
        </Field>
      )}
      {!hidePalette && <CoveragePaletteControl settings={settings} onChange={onChange} />}
      <Field label={t("coverageScaleMax")}>
        <Num
          aria-label={t("coverageScaleMax")}
          value={c.coverageScaleMax}
          min={c.coverageThreshold}
          max={MAX_COVERAGE_VIEWS}
          step={1}
          onChange={(n) =>
            onChange({ coverageScaleMax: Math.max(c.coverageThreshold, Math.round(n)) })
          }
        />
      </Field>
      <div className="preset-row">
        {[4, 6, 8, 10, 12].map((n) => (
          <button
            key={n}
            disabled={n < c.coverageThreshold}
            className={c.coverageScaleMax === n ? "active" : ""}
            onClick={() => onChange({ coverageScaleMax: n })}
          >
            {n}
          </button>
        ))}
      </div>
      <Toggle
        label={t("highlightCoverage")}
        checked={c.highlightCoverageThreshold}
        onChange={(v) => onChange({ highlightCoverageThreshold: v })}
      />
      <p className="muted tiny">{t("coverageDisplayHint")}</p>
    </div>
  );
}

export function CoveragePaletteControl({
  settings,
  onChange,
}: {
  settings: Partial<Settings>;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const t = useT(),
    c = coverageSettings(settings);
  return (
    <Field label={t("coveragePalette")}>
      <select
        aria-label={t("coveragePalette")}
        value={c.coveragePalette}
        onChange={(e) =>
          onChange({ coveragePalette: e.target.value as typeof c.coveragePalette })
        }
      >
        <option value="spectrum">{t("paletteSpectrum")}</option>
        <option value="blue">{t("paletteBlue")}</option>
      </select>
    </Field>
  );
}

export function CoverageLegend({ settings }: { settings: Partial<Settings> }) {
  const t = useT(),
    c = coverageSettings(settings);
  return (
    <div className="coverage-legend">
      <div
        className="gradient coverage"
        style={{ background: coverageGradient(c.coveragePalette) }}
      >
        <i
          className="coverage-target-tick"
          style={{ left: `${(100 * c.coverageThreshold) / c.coverageScaleMax}%` }}
        />
      </div>
      <div className="legend-range">
        <span>0</span>
        <span>
          {t("coverageTargetLine")} ≥{c.coverageThreshold}
        </span>
        <span>{c.coverageScaleMax}+</span>
      </div>
    </div>
  );
}
