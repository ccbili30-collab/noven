import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../../", import.meta.url)

test("packages Windows builds with the complete CreatX icon asset", async () => {
  const builderConfig = await readFile(new URL("electron-builder.yml", projectRoot), "utf8")
  assert.match(builderConfig, /^\s{2}icon: apps\/desktop\/build\/icon\.ico$/m)

  const icon = await readFile(new URL("apps/desktop/build/icon.ico", projectRoot))
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0])

  const imageCount = icon.readUInt16LE(4)
  const sizes = Array.from({ length: imageCount }, (_, index) => {
    const offset = 6 + index * 16
    const width = icon[offset] === 0 ? 256 : icon[offset]
    const height = icon[offset + 1] === 0 ? 256 : icon[offset + 1]
    assert.equal(width, height)
    return width
  })

  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256])
})
