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
      transcription: { apiKeyConfigured: false, configured: false },
      video: { cookieSource: "noven" },
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

  test("loads a settings file written before transcription and video existed", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, textProfiles: [], image: { defaultModel: "gpt-image-2-cheap" } }), "utf8")

    const store = new UserModelSettingsStore(path, codec)

    expect(store.snapshot().transcription).toEqual({ apiKeyConfigured: false, configured: false })
    // 抖音 refuses anonymous extraction, so an upgraded install defaults to the app acquiring
    // its own cookies rather than to a mode that cannot work.
    expect(store.snapshot().video).toEqual({ cookieSource: "noven" })
    expect(store.resolveTranscriptionConnection()).toBeUndefined()
  })

  test("allows a keyless private-network transcription endpoint but not a plaintext hostname", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    const store = new UserModelSettingsStore(path, codec)

    // A LAN inference box has no public certificate and usually no API key.
    store.saveTranscriptionSettings({ baseUrl: "http://192.168.1.50:8000/v1", model: "Systran/faster-whisper-large-v3", language: "zh" })
    expect(new UserModelSettingsStore(path, codec).resolveTranscriptionConnection()).toEqual({ baseUrl: "http://192.168.1.50:8000/v1", model: "Systran/faster-whisper-large-v3", language: "zh" })
    expect(store.snapshot().transcription).toMatchObject({ apiKeyConfigured: false, configured: true })

    store.saveTranscriptionSettings({ baseUrl: "https://api.siliconflow.cn/v1", model: "FunAudioLLM/SenseVoiceSmall", apiKey: "sk-secret" })
    expect(store.resolveTranscriptionConnection()?.apiKey).toBe("sk-secret")
    expect(JSON.stringify(store.snapshot())).not.toContain("sk-secret")

    // A name over plain HTTP could later resolve to a public address and ship audio off-machine.
    expect(() => store.saveTranscriptionSettings({ baseUrl: "http://dgx.local:8000/v1", model: "whisper" })).toThrow("model_settings_invalid")
    expect(() => store.saveTranscriptionSettings({ baseUrl: "http://8.8.8.8:8000/v1", model: "whisper" })).toThrow("model_settings_invalid")
    expect(() => store.saveTranscriptionSettings({ baseUrl: "https://user:pass@api.example.com/v1", model: "whisper" })).toThrow("model_settings_invalid")
    // The text and image providers must not have been loosened by the transcription exception.
    expect(() => store.saveImageSettings({ baseUrl: "http://192.168.1.50:8000/v1", defaultModel: "gpt-image-2" })).toThrow("model_settings_invalid")
  })

  test("persists the cookie source and rejects an unsupported one", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    const store = new UserModelSettingsStore(path, codec)

    expect(store.saveVideoSettings({ cookieSource: "edge" }).video).toEqual({ cookieSource: "edge" })
    expect(new UserModelSettingsStore(path, codec).resolveVideoSettings()).toEqual({ cookieSource: "edge" })
    expect(() => store.saveVideoSettings({ cookieSource: "safari" as "edge" })).toThrow("model_settings_invalid")
  })

  test("refuses to save a text profile whose provider is not a known provider id", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const store = new UserModelSettingsStore(join(root, "models.json"), codec)

    expect(() => store.saveTextProfile({ name: "Luna", providerId: "gpt-5.6-luna", modelId: "gpt-5.6-luna", apiKey: "secret" }))
      .toThrow('model_settings_invalid: unknown API Provider "gpt-5.6-luna"')
    expect(store.snapshot().textProfiles).toHaveLength(0)
  })

  test("repairs a legacy profile whose provider slot holds its model id, keeping the profile id", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1,
      selectedTextProfileId: "text_good",
      textProfiles: [
        { id: "text_bad", name: "gpt-5.6-luna", providerId: "gpt-5.6-luna", modelId: "gpt-5.6-luna", baseUrl: "https://jmrai.net/v1", encryptedApiKey: codec.encrypt("legacy") },
        { id: "text_good", name: "gpt-5.6-luna", providerId: "openai-compatible", modelId: "gpt-5.6-luna", baseUrl: "https://jmrai.net/v1", encryptedApiKey: codec.encrypt("current") },
      ],
      image: { defaultModel: "gpt-image-2-cheap" },
    }), "utf8")
    const store = new UserModelSettingsStore(path, codec)

    const report = store.repairLegacyTextProfiles()

    expect(report).toEqual({ repaired: [{ id: "text_bad", name: "gpt-5.6-luna", from: "gpt-5.6-luna", to: "openai-compatible" }], unresolved: [] })
    const restarted = new UserModelSettingsStore(path, codec)
    expect(restarted.resolveTextConnection("text_bad")).toMatchObject({ profileId: "text_bad", providerId: "openai-compatible", modelId: "gpt-5.6-luna", apiKey: "legacy" })
    expect(restarted.resolveTextConnection("text_good")).toMatchObject({ providerId: "openai-compatible", apiKey: "current" })
  })

  test("reports instead of guessing when a legacy profile has no unique donor", () => {
    const root = mkdtempSync(join(tmpdir(), "creatx-model-settings-"))
    roots.push(root)
    const path = join(root, "models.json")
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1,
      textProfiles: [
        // provider !== model: outside the bounded repair shape.
        { id: "text_odd", name: "旧连接", providerId: "my-gateway", modelId: "gpt-5.6-luna", baseUrl: "https://jmrai.net/v1" },
        // provider === model but the only sibling differs in Base URL, so no donor matches.
        { id: "text_bad", name: "Luna", providerId: "gpt-5.6-luna", modelId: "gpt-5.6-luna", baseUrl: "https://other.example.com/v1" },
        { id: "text_good", name: "Luna", providerId: "openai-compatible", modelId: "gpt-5.6-luna", baseUrl: "https://jmrai.net/v1" },
      ],
      image: { defaultModel: "gpt-image-2-cheap" },
    }), "utf8")
    const store = new UserModelSettingsStore(path, codec)

    const report = store.repairLegacyTextProfiles()

    expect(report.repaired).toEqual([])
    expect(report.unresolved).toEqual([
      { id: "text_odd", name: "旧连接", providerId: "my-gateway" },
      { id: "text_bad", name: "Luna", providerId: "gpt-5.6-luna" },
    ])
    expect(new UserModelSettingsStore(path, codec).resolveTextConnection("text_bad")).toMatchObject({ providerId: "gpt-5.6-luna" })
  })
})
