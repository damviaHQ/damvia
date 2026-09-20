export const gridClasses = 'flex flex-wrap gap-6 p-0.5'
export const gridCardClasses = 'group w-[276px] max-w-full min-w-0'
export const gridPreviewClasses = 'relative h-[196px] overflow-hidden bg-neutral-100'

// Production thumbnail favorite styling: light-filled stars with no button surface.
export const thumbnailFavoriteButtonClasses = 'group/favorite grid size-6 shrink-0 place-items-center border-0 bg-transparent p-0 text-neutral-500 transition-[opacity,color] duration-200 ease-in-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600'

// Masonry fills the whole width: the chosen size sets the smallest tile the
// reader wants, the columns then share whatever is left over, and the gap is
// the same horizontally and vertically.
export const MASONRY_GAP = 8
// Rows are a fine unit so a tile spans close to its exact height; whatever is
// left inside the span is the vertical gap.
const MASONRY_ROW = 4
// Wide enough that a real picture always keeps its own shape and is never
// cropped; the bounds only catch a pathological banner or column.
const MASONRY_MIN_RATIO = 0.15
const MASONRY_MAX_RATIO = 4
const MASONRY_FALLBACK_RATIO = 0.75

export const masonryCardClasses = 'group relative min-w-0'
export const masonryPreviewClasses = 'relative size-full overflow-hidden bg-neutral-100 group-hover:shadow-lg group-has-[:focus-visible]:shadow-lg'

// How many columns of at least `minWidth` fit, and how wide each really is.
export function masonryColumns(containerWidth: number, minWidth: number) {
  const count = Math.max(1, Math.floor((containerWidth + MASONRY_GAP) / (minWidth + MASONRY_GAP)))
  return { count, width: (containerWidth - (count - 1) * MASONRY_GAP) / count }
}

// A tile takes its file's own proportions, so the picture fills it exactly and
// nothing is cropped, and spans the rows its height plus one gap needs.
export function masonryTile(dimensions: { width?: number | null, height?: number | null } | null | undefined, columnWidth: number, measuredRatio?: number) {
  const { width, height } = dimensions ?? {}
  const ratio = measuredRatio ?? (width && height ? height / width : MASONRY_FALLBACK_RATIO)
  const clamped = Math.min(Math.max(ratio, MASONRY_MIN_RATIO), MASONRY_MAX_RATIO)
  const tileHeight = Math.round(columnWidth * clamped)
  return { height: tileHeight, span: Math.ceil((tileHeight + MASONRY_GAP) / MASONRY_ROW) }
}

export function masonryGridStyle(columns: number) {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    columnGap: `${MASONRY_GAP}px`,
    rowGap: '0px',
    gridAutoRows: `${MASONRY_ROW}px`,
  }
}
