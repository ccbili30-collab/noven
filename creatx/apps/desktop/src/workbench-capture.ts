const MAX_CAPTURE_PIXELS = 16_777_216
const SUBPIXEL_EDGE_TOLERANCE = 0.01

export interface WorkbenchCaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkbenchCaptureBounds {
  width: number
  height: number
}

export function normalizeWorkbenchCaptureRect(rect: WorkbenchCaptureRect, bounds: WorkbenchCaptureBounds) {
  const values = [rect.x, rect.y, rect.width, rect.height, bounds.width, bounds.height]
  if (!values.every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width < 2 || rect.height < 2 || bounds.width < 2 || bounds.height < 2) {
    throw new Error("workbench_capture_invalid: geometry")
  }

  const x = Math.floor(rect.x)
  const y = Math.floor(rect.y)
  const rawRight = rect.x + rect.width
  const rawBottom = rect.y + rect.height
  if (rawRight > bounds.width + SUBPIXEL_EDGE_TOLERANCE || rawBottom > bounds.height + SUBPIXEL_EDGE_TOLERANCE) {
    throw new Error("workbench_capture_invalid: bounds")
  }
  const right = Math.min(bounds.width, Math.ceil(rawRight))
  const bottom = Math.min(bounds.height, Math.ceil(rawBottom))
  const width = right - x
  const height = bottom - y

  if (right > bounds.width || bottom > bounds.height || width * height > MAX_CAPTURE_PIXELS) {
    throw new Error("workbench_capture_invalid: bounds")
  }

  return { x, y, width, height }
}

export async function captureWorkbenchRegion<T>(
  capture: (rect: WorkbenchCaptureRect) => Promise<T>,
  rect: WorkbenchCaptureRect,
  bounds: WorkbenchCaptureBounds,
) {
  return capture(normalizeWorkbenchCaptureRect(rect, bounds))
}
