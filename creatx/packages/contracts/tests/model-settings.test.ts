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
    }

    expect(JSON.stringify(snapshot)).not.toContain("apiKey\"")
    expect(snapshot.textProfiles[0]?.apiKeyConfigured).toBeTrue()
    expect(snapshot.image.apiKeyConfigured).toBeTrue()
  })
})
