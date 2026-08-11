import { describe, expect, test } from "bun:test"
import type { ModelSettingsSnapshot } from "../src"

describe("model settings contract", () => {
  test("projects configured credentials without returning secret fields", () => {
    const snapshot: ModelSettingsSnapshot = {
      textProfiles: [{
        id: "text_deepseek",
        name: "DeepSeek",
        providerId: "deepseek",
        modelId: "deepseek-chat",
        apiKeyConfigured: true,
      }],
      selectedTextProfileId: "text_deepseek",
      image: {
        defaultModel: "gpt-image-2-cheap",
        apiKeyConfigured: true,
        configured: true,
      },
      transcription: {
        baseUrl: "http://192.168.1.50:8000/v1",
        model: "Systran/faster-whisper-large-v3",
        apiKeyConfigured: false,
        configured: true,
      },
      video: { cookieSource: "none" },
    }

    expect(JSON.stringify(snapshot)).not.toContain("apiKey\"")
    expect(snapshot.textProfiles[0]?.apiKeyConfigured).toBeTrue()
    expect(snapshot.image.apiKeyConfigured).toBeTrue()
    expect(snapshot.transcription.configured).toBeTrue()
  })
})
