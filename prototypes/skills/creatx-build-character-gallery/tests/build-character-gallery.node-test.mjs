import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

const skillDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const builder = path.join(skillDirectory, "scripts", "build-character-gallery.mjs")

test("builds five notable figures and one ordinary person idempotently", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "creatx-character-gallery-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, "portraits"))
  const portrait = path.join(root, "portraits", "portrait.png")
  await writeFile(
    portrait,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  )

  const manifest = {
    schemaVersion: 1,
    worldTitle: "测试世界",
    visualStyleSource: "视觉设定/统一画风.md",
    characters: Array.from({ length: 6 }, (_, index) => character(index)),
  }
  const manifestPath = path.join(root, "manifest.json")
  const output = path.join(root, "人物群像")
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8")

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, [builder, "--manifest", manifestPath, "--output", output], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.equal(summary.notableCount, 5)
    assert.equal(summary.ordinaryCount, 1)
    assert.deepEqual(summary.missingVisualStyle, [])
  }

  manifest.characters[5].visualStyleApplied = false
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8")
  const warningResult = spawnSync(process.execPath, [builder, "--manifest", manifestPath, "--output", output], { encoding: "utf8" })
  assert.equal(warningResult.status, 0, warningResult.stderr)
  const warningSummary = JSON.parse(warningResult.stdout)
  assert.deepEqual(warningSummary.missingVisualStyle, ["person-6"])
  assert.equal(warningSummary.warnings.length, 1)

  await access(path.join(output, "index.html"))
  await access(path.join(output, "characters", "person-6", "index.html"))
  await access(path.join(output, "characters", "person-6", "assets", "portrait.png"))
  const galleryData = await readFile(path.join(output, "gallery-data.js"), "utf8")
  assert.match(galleryData, /人间尺度人物/)
  assert.doesNotMatch(galleryData, /sourcePaths/)
})

test("refuses to overwrite an unowned directory", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "creatx-character-gallery-unowned-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, "portraits"))
  await writeFile(
    path.join(root, "portraits", "portrait.png"),
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  )
  const manifestPath = path.join(root, "manifest.json")
  await writeFile(
    manifestPath,
    JSON.stringify({ schemaVersion: 1, worldTitle: "测试世界", characters: Array.from({ length: 6 }, (_, index) => character(index)) }),
    "utf8",
  )
  const output = path.join(root, "existing")
  await mkdir(output)
  await writeFile(path.join(output, "keep.txt"), "do not delete", "utf8")

  const result = spawnSync(process.execPath, [builder, "--manifest", manifestPath, "--output", output], { encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.equal(await readFile(path.join(output, "keep.txt"), "utf8"), "do not delete")
})

function character(index) {
  const ordinary = index === 5
  return {
    id: `person-${index + 1}`,
    role: ordinary ? "ordinary" : "notable",
    evidenceStatus: ordinary ? "created" : "source",
    name: ordinary ? "人间尺度人物" : `著名人物${index + 1}`,
    subtitle: ordinary ? "河港修网人" : "世界事务参与者",
    quote: "“一句能够定义人物的话。”",
    significance: ordinary ? "让世界落回一日三餐" : "改变世界的一段关系",
    portrait: "portraits/portrait.png",
    portraitAlt: "测试人物立绘",
    visualStyleApplied: true,
    visualHook: { kind: ordinary ? "human-specificity" : "authority", summary: "清晰的人物视觉钩子" },
    headline: { kicker: "人物定义", title: "一句角色命题。", intro: "用于验证电影化人物页面。" },
    profile: [{ label: "身份", value: "测试身份" }],
    relationships: [{ role: "关系", name: "另一人", description: "测试关系" }],
    affiliation: [{ label: "地域", value: "测试地域" }],
    bible: Array.from({ length: 6 }, (_, bibleIndex) => ({
      icon: "✥",
      title: `圣经模块${bibleIndex + 1}`,
      paragraphs: ["测试正文。"],
    })),
    sourcePaths: ["世界基准.md"],
  }
}
