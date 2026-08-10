export interface HsvColor {
  h: number
  s: number
  v: number
}

const HEX_COLOR = /^#[0-9A-F]{6}$/

export function hexToHsv(input: string): HsvColor {
  const color = input.toLocaleUpperCase("en-US")
  if (!HEX_COLOR.test(color)) throw new Error("workbench_color_invalid: expected #RRGGBB")
  const red = Number.parseInt(color.slice(1, 3), 16) / 255
  const green = Number.parseInt(color.slice(3, 5), 16) / 255
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const hue = delta === 0
    ? 0
    : max === red
      ? 60 * (((green - blue) / delta) % 6)
      : max === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4)
  return { h: Math.round((hue + 360) % 360), s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToHex(hue: number, saturation: number, value: number) {
  if (![hue, saturation, value].every(Number.isFinite)) throw new Error("workbench_color_invalid: HSV must be finite")
  const h = ((hue % 360) + 360) % 360
  const s = Math.min(1, Math.max(0, saturation))
  const v = Math.min(1, Math.max(0, value))
  const chroma = v * s
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1))
  const match = v - chroma
  const [red, green, blue] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("").toLocaleUpperCase("en-US")}`
}
