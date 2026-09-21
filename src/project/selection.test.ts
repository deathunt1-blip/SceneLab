import { expect, it } from "vitest";
import { treeSelection } from "./selection";

it("selects contiguous visible rows in both directions and retains the shift anchor", () => {
  const rows = ["a", "b", "c", "d", "e"];
  const forward = treeSelection(rows, ["b"], "b", "d", true, false);
  expect(forward).toEqual({ selected: ["b", "c", "d"], anchor: "b" });
  expect(
    treeSelection(rows, forward.selected, forward.anchor, "a", true, false).selected,
  ).toEqual(["a", "b"]);
});
it("Ctrl toggles single rows, Ctrl+Shift adds a range, and collapsed anchors fall back to one row", () => {
  const rows = ["a", "b", "c", "d"];
  expect(treeSelection(rows, ["a", "b"], "a", "b", false, true).selected).toEqual(["a"]);
  expect(treeSelection(rows, ["a"], "b", "d", true, true).selected).toEqual(rows);
  expect(treeSelection(rows, ["hidden"], "hidden", "c", true, false)).toEqual({
    selected: ["c"],
    anchor: "c",
  });
});
