import type { CoveragePalette } from "../simulation/coverage";

const palettes = {
  spectrum: ["#3a68c7", "#26bacc", "#41c89c", "#b8d850", "#efb64b", "#e76c4e"],
  blue: ["#d8edf9", "#a7d1ee", "#6aa9d7", "#367fbc", "#155593", "#123b70"],
} satisfies Record<CoveragePalette, string[]>;

// Shared stops keep all viewport and report legends aligned with the heatmap.
export const coveragePaletteColors = (palette: CoveragePalette = "spectrum") =>
  palettes[palette];
export const coverageGradient = (palette: CoveragePalette = "spectrum") =>
  `linear-gradient(90deg, ${coveragePaletteColors(palette).join(", ")})`;
