export type SourceImageWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type SourceWindowViewport = {
  sourceWidth: number;
  sourceHeight: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  outputScale?: number;
  paddingFraction?: number;
  maxOutputEdge?: number;
};

/** Map the visible CSS viewport to integer full-source pixel edges and output sampling dimensions. */
export function sourceWindowForViewport(view: SourceWindowViewport): SourceImageWindow | null {
  const positive = [view.sourceWidth, view.sourceHeight, view.contentWidth, view.contentHeight,
    view.viewportWidth, view.viewportHeight];
  if (positive.some(value => !Number.isFinite(value) || value <= 0)
      || !Number.isFinite(view.scrollLeft) || !Number.isFinite(view.scrollTop)) return null;

  const outputScale = view.outputScale ?? 1;
  const paddingFraction = view.paddingFraction ?? 0.05;
  const maxOutputEdge = view.maxOutputEdge ?? 2048;
  if (!Number.isFinite(outputScale) || outputScale <= 0
      || !Number.isFinite(paddingFraction) || paddingFraction < 0 || paddingFraction > 0.5
      || !Number.isInteger(maxOutputEdge) || maxOutputEdge <= 0) return null;

  const padX = view.viewportWidth * paddingFraction;
  const padY = view.viewportHeight * paddingFraction;
  const leftCss = Math.max(0, Math.min(view.contentWidth, view.scrollLeft - padX));
  const topCss = Math.max(0, Math.min(view.contentHeight, view.scrollTop - padY));
  const rightCss = Math.max(leftCss, Math.min(view.contentWidth, view.scrollLeft + view.viewportWidth + padX));
  const bottomCss = Math.max(topCss, Math.min(view.contentHeight, view.scrollTop + view.viewportHeight + padY));
  const x = Math.max(0, Math.floor(leftCss / view.contentWidth * view.sourceWidth));
  const y = Math.max(0, Math.floor(topCss / view.contentHeight * view.sourceHeight));
  const right = Math.min(view.sourceWidth, Math.ceil(rightCss / view.contentWidth * view.sourceWidth));
  const bottom = Math.min(view.sourceHeight, Math.ceil(bottomCss / view.contentHeight * view.sourceHeight));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;

  const outputWidth = Math.max(1, Math.min(maxOutputEdge,
    Math.ceil(width * view.contentWidth / view.sourceWidth * outputScale)));
  const outputHeight = Math.max(1, Math.min(maxOutputEdge,
    Math.ceil(height * view.contentHeight / view.sourceHeight * outputScale)));
  return {
    x, y, width, height, outputWidth, outputHeight,
    leftPercent: x / view.sourceWidth * 100,
    topPercent: y / view.sourceHeight * 100,
    widthPercent: width / view.sourceWidth * 100,
    heightPercent: height / view.sourceHeight * 100,
  };
}
