import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { UserModelSettingsStore } from "../src"

const roots: string[] = []
const codec = {
  encrypt: (value: string) => `encrypted:${Buffer.from(value).toString("base64")}`,
  decrypt: (value: string) => Buffer.from(value.replace(/^encrypted:/, ""), "base64").toString(),
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("user model settings", () => {
  test("persists text and image connections while projections redact secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    const store = new UserModelSettingsStore(path, codec)

    const text = store.saveTextProfile({
      name: "DeepSeek",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "text-secret",
    })
    store.saveImageSettings({
      baseUrl: "https://jmrai.net/v1",
      defaultModel: "gpt-image-2",
      apiKey: "image-secret",
    })
    const restarted = new UserModelSettingsStore(path, codec)

    expect(restarted.snapshot()).toEqual({
      textProfiles: [{
        id: text.textProfiles[0]!.id,
        name: "DeepSeek",
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKeyConfigured: true,
      }],
      selectedTextProfileId: text.textProfiles[0]!.id,
      image: {
        baseUrl: "https://jmrai.net/v1",
        defaultModel: "gpt-image-2",
        apiKeyConfigured: true,
        configured: true,
      },
    })
    expect(restarted.resolveSelectedTextConnection()?.apiKey).toBe("text-secret")
    expect(restarted.resolveImageConnection()?.apiKey).toBe("image-secret")
    expect(JSON.stringify(restarted.snapshot())).not.toContain("text-secret")
    expect(JSON.stringify(restarted.snapshot())).not.toContain("image-secret")
  })

  test("preserves an existing secret when editing non-secret fields", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const store = new UserModelSettingsStore(join(root, "models.json"), codec)
    const created = store.saveTextProfile({ name: "旧名称", providerId: "deepseek", modelId: "deepseek-chat", apiKey: "secret" })

    store.saveTextProfile({ id: created.textProfiles[0]!.id, name: "新名称", providerId: "deepseek", modelId: "deepseek-reasoner" })

    expect(store.resolveSelectedTextConnection()).toMatchObject({ name: "新名称", modelId: "deepseek-reasoner", apiKey: "secret" })
  })

  test("makes the profile saved in settings the global default", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const store = new UserModelSettingsStore(join(root, "models.json"), codec)
    const first = store.saveTextProfile({ name: "DeepSeek", providerId: "deepseek", modelId: "deepseek-chat", apiKey: "first" })
    const second = store.saveTextProfile({ name: "Luna", providerId: "openai-compatible", modelId: "gpt-5.6-luna", apiKey: "second" })

    expect(first.selectedTextProfileId).toBe(first.textProfiles[0]!.id)
    expect(second.selectedTextProfileId).toBe(second.textProfiles[1]!.id)
    expect(store.resolveSelectedTextConnection()).toMatchObject({ profileId: second.textProfiles[1]!.id, modelId: "gpt-5.6-luna", apiKey: "second" })
  })

  test("fails closed for unknown selection, malformed storage and decryption failure", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    const store = new UserModelSettingsStore(path, codec)
    const created = store.saveTextProfile({ name: "DeepSeek", providerId: "deepseek", modelId: "deepseek-chat", apiKey: "secret" })

    expect(() => store.selectTextProfile("missing")).toThrow("model_settings_invalid")
    expect(() => new UserModelSettingsStore(path, { ...codec, decrypt: () => { throw new Error("locked") } }).resolveTextConnection(created.textProfiles[0]!.id)).toThrow("model_settings_persistence")

    writeFileSync(path, "{broken", "utf8")
    expect(() => new UserModelSettingsStore(path, codec)).toThrow("model_settings_persistence")
  })
})
