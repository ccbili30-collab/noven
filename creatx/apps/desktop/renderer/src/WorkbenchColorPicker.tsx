import { useMemo, useState } from "react"
import type { PointerEvent } from "react"
import { Pipette } from "lucide-react"
import { hexToHsv, hsvToHex } from "./workbench-color"

export function WorkbenchColorPicker({ color, recent, onColor, onSample }: { color: string; recent: readonly string[]; onColor: (color: string) => void; onSample: () => void }) {
  const hsv = useMemo(() => hexToHsv(color), [color])
  const [hexInput, setHexInput] = useState(color)
  const selectSv = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return
    const rect = event.currentTarget.getBoundingClientRect()
    onColor(hsvToHex(hsv.h, (event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height))
  }
  const selectHue = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return
    const rect = event.currentTarget.getBoundingClientRect()
    onColor(hsvToHex(360 * (event.clientX - rect.left) / rect.width, hsv.s, hsv.v))
  }
  const commitHex = () => {
    try {
      const normalized = `#${hexInput.replace(/^#/, "")}`.toLocaleUpperCase("en-US")
      hexToHsv(normalized)
      onColor(normalized)
      setHexInput(normalized)
    } catch {
      setHexInput(color)
    }
  }

  return <div className="wb-annotation-color-picker" role="dialog" aria-label="批注调色盘">
    <div className="wb-color-sv" style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }} onPointerDown={selectSv} onPointerMove={selectSv}>
      <span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
    </div>
    <div className="wb-color-hue" onPointerDown={selectHue} onPointerMove={selectHue}><span style={{ left: `${hsv.h / 360 * 100}%` }} /></div>
    <div className="wb-color-value"><span style={{ backgroundColor: color }} /><input aria-label="十六进制颜色" value={hexInput} maxLength={7} onChange={(event) => setHexInput(event.currentTarget.value)} onBlur={commitHex} onKeyDown={(event) => { if (event.key === "Enter") commitHex() }} /><button title="从作品取色" onClick={onSample}><Pipette size={15} /></button></div>
    {recent.length > 0 && <div className="wb-color-recent" aria-label="最近颜色">{recent.map((value) => <button key={value} title={value} style={{ backgroundColor: value }} onClick={() => onColor(value)} />)}</div>}
  </div>
}
