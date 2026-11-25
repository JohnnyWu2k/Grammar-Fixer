interface AnnotationAnchor {
  x: number;
  y: number;
}

interface AnnotationSlot extends AnnotationAnchor {
  maxWidth: number;
}

export function placeAnnotations(
  anchors: readonly AnnotationAnchor[], editorWidth: number,
): AnnotationSlot[] {
  const rows = new Map<number, { x: number; index: number }[]>();
  anchors.forEach(({ x, y }, index) => {
    const row = rows.get(y) ?? [];
    row.push({ x, index });
    rows.set(y, row);
  });
  const edge = Math.min(4, editorWidth / 4);
  const right = editorWidth - edge;
  const positions: AnnotationSlot[] = [];
  for (const [y, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    const gap = Math.min(4, Math.floor((right - edge) / (2 * row.length)));
    const minWidth = Math.min(40, (right - edge - (row.length - 1) * gap) / row.length);
    let left = edge;
    row.forEach(({ x, index }, i) => {
      const reserved = (row.length - 1 - i) * (minWidth + gap);
      const start = Math.max(left, Math.min(x, right - reserved - minWidth));
      positions[index] = { x: start, y, maxWidth: minWidth };
      left = start + minWidth + gap;
    });
    row.forEach(({ index }, i) => {
      const slot = positions[index]!;
      const next = row[i + 1];
      const end = next ? positions[next.index]!.x - gap : right;
      slot.maxWidth = Math.min(216, end - slot.x);
    });
  }
  return positions;
}
