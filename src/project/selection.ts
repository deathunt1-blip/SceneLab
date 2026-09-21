/** Shift uses the displayed row order; Ctrl/Cmd adds or removes individual rows. */
export function treeSelection(
  ordered: string[],
  selected: string[],
  anchor: string | null,
  id: string,
  shift: boolean,
  additive: boolean,
) {
  const from = anchor ? ordered.indexOf(anchor) : -1;
  const to = ordered.indexOf(id);
  if (shift && from >= 0 && to >= 0) {
    const range = ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { selected: additive ? [...new Set([...selected, ...range])] : range, anchor };
  }
  return {
    selected: additive
      ? selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
      : [id],
    anchor: id,
  };
}
