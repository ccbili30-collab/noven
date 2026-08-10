import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type {
  ImageGenerationModel,
  ModelSettingsSnapshot,
  SaveImageModelSettingsCommand,
  SaveTextModelProfileCommand,
} from "@creatx/contracts"

export interface SecretCodec {
  encrypt(value: string): string
  decrypt(value: string): string
}

export interface TextModelConnection {
  profileId: string
  name: string
  providerId: string
  modelId: string
  baseUrl?: string
  apiKey?: string
}

export interface ImageModelConnection {
  baseUrl: string
  apiKey: string
  defaultModel: ImageGenerationModel
}

interface StoredTextProfile {
  id: string
  name: string
  providerId: string
  modelId: string
  baseUrl?: string
  encryptedApiKey?: string
}

interface StoredImageSettings {
  baseUrl?: string
  defaultModel: ImageGenerationModel
  encryptedApiKey?: string
}

interface StoredModelSettings {
  schemaVersion: 1
  selectedTextProfileId?: string
  textProfiles: StoredTextProfile[]
  image: StoredImageSettings
}

const emptySettings = (): StoredModelSettings => ({
  schemaVersion: 1,
  textProfiles: [],
  image: { defaultModel: "gpt-image-2-cheap" },
})

export class UserModelSettingsStore {
  private readonly path: string
  private readonly codec: SecretCodec
  private settings: StoredModelSettings

  constructor(path: string, codec: SecretCodec) {
    this.path = path
    this.codec = codec
    this.settings = existsSync(path) ? readSettings(path) : emptySettings()
  }

  snapshot(): ModelSettingsSnapshot {
    return {
      textProfiles: this.settings.textProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        providerId: profile.providerId,
        modelId: profile.modelId,
        ...(profile.baseUrl ? { baseUrl: profile.baseUrl } : {}),
        apiKeyConfigured: Boolean(profile.encryptedApiKey),
      })),
      ...(this.settings.selectedTextProfileId ? { selectedTextProfileId: this.settings.selectedTextProfileId } : {}),
      image: {
        ...(this.settings.image.baseUrl ? { baseUrl: this.settings.image.baseUrl } : {}),
        defaultModel: this.settings.image.defaultModel,
        apiKeyConfigured: Boolean(this.settings.image.encryptedApiKey),
        configured: Boolean(this.settings.image.baseUrl && this.settings.image.encryptedApiKey),
      },
    }
  }

  saveTextProfile(command: SaveTextModelProfileCommand) {
    const id = command.id?.trim() || `text_${randomUUID()}`
    const existing = this.settings.textProfiles.find((profile) => profile.id === id)
    const encryptedApiKey = updatedSecret(existing?.encryptedApiKey, command.apiKey, command.clearApiKey, this.codec)
    const baseUrl = optionalBaseUrl(command.baseUrl)
    const profile: StoredTextProfile = {
      id,
      name: requireText(command.name, "name"),
      providerId: requireText(command.providerId, "providerId"),
      modelId: requireText(command.modelId, "modelId"),
      ...(baseUrl ? { baseUrl } : {}),
      ...(encryptedApiKey ? { encryptedApiKey } : {}),
    }
    const textProfiles = existing
      ? this.settings.textProfiles.map((candidate) => candidate.id === id ? profile : candidate)
      : [...this.settings.textProfiles, profile]
    this.settings = {
      ...this.settings,
      textProfiles,
      selectedTextProfileId: id,
    }
    this.persist()
    return this.snapshot()
  }

  selectTextProfile(profileId: string) {
    const id = requireText(profileId, "profileId")
    if (!this.settings.textProfiles.some((profile) => profile.id === id)) {
      throw new Error("model_settings_invalid: selected text profile does not exist")
    }
    this.settings = { ...this.settings, selectedTextProfileId: id }
    this.persist()
    return this.snapshot()
  }

  saveImageSettings(command: SaveImageModelSettingsCommand) {
    const encryptedApiKey = updatedSecret(this.settings.image.encryptedApiKey, command.apiKey, command.clearApiKey, this.codec)
    this.settings = {
      ...this.settings,
      image: {
        baseUrl: requireBaseUrl(command.baseUrl),
        defaultModel: requireImageModel(command.defaultModel),
        ...(encryptedApiKey ? { encryptedApiKey } : {}),
      },
    }
    this.persist()
    return this.snapshot()
  }

  resolveTextConnection(profileId: string): TextModelConnection | undefined {
    const profile = this.settings.textProfiles.find((candidate) => candidate.id === profileId)
    if (!profile) return undefined
    return {
      profileId: profile.id,
      name: profile.name,
      providerId: profile.providerId,
      modelId: profile.modelId,
      ...(profile.baseUrl ? { baseUrl: profile.baseUrl } : {}),
      ...(profile.encryptedApiKey ? { apiKey: decryptSecret(profile.encryptedApiKey, this.codec) } : {}),
    }
  }

  resolveSelectedTextConnection() {
    return this.settings.selectedTextProfileId ? this.resolveTextConnection(this.settings.selectedTextProfileId) : undefined
  }

  resolveConnection(providerId: string, modelId: string) {
    const profile = this.settings.textProfiles.find((candidate) => candidate.providerId === providerId && candidate.modelId === modelId)
    return profile ? this.resolveTextConnection(profile.id) : undefined
  }

  resolveImageConnection(): ImageModelConnection | undefined {
    const image = this.settings.image
    if (!image.baseUrl || !image.encryptedApiKey) return undefined
    return {
      baseUrl: image.baseUrl,
      apiKey: decryptSecret(image.encryptedApiKey, this.codec),
      defaultModel: image.defaultModel,
    }
  }

  private persist() {
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      renameSync(temporary, this.path)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw new Error(`model_settings_persistence: ${messageOf(error)}`, { cause: error })
    }
  }
}

function readSettings(path: string): StoredModelSettings {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`model_settings_persistence: settings could not be read: ${messageOf(error)}`, { cause: error })
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.textProfiles) || !isRecord(value.image)) {
    throw new Error("model_settings_persistence: unsupported or malformed settings file")
  }
  const textProfiles = value.textProfiles.map(readTextProfile)
  const selectedTextProfileId = value.selectedTextProfileId === undefined ? undefined : requireText(value.selectedTextProfileId, "selectedTextProfileId")
  if (selectedTextProfileId && !textProfiles.some((profile) => profile.id === selectedTextProfileId)) {
    throw new Error("model_settings_persistence: selected text profile does not exist")
  }
  return {
    schemaVersion: 1,
    textProfiles,
    ...(selectedTextProfileId ? { selectedTextProfileId } : {}),
    image: {
      ...(value.image.baseUrl === undefined ? {} : { baseUrl: requireBaseUrl(value.image.baseUrl) }),
      defaultModel: requireImageModel(value.image.defaultModel),
      ...(value.image.encryptedApiKey === undefined ? {} : { encryptedApiKey: requireText(value.image.encryptedApiKey, "image.encryptedApiKey") }),
    },
  }
}

function readTextProfile(value: unknown): StoredTextProfile {
  if (!isRecord(value)) throw new Error("model_settings_persistence: malformed text profile")
  return {
    id: requireText(value.id, "textProfile.id"),
    name: requireText(value.name, "textProfile.name"),
    providerId: requireText(value.providerId, "textProfile.providerId"),
    modelId: requireText(value.modelId, "textProfile.modelId"),
    ...(value.baseUrl === undefined ? {} : { baseUrl: requireBaseUrl(value.baseUrl) }),
    ...(value.encryptedApiKey === undefined ? {} : { encryptedApiKey: requireText(value.encryptedApiKey, "textProfile.encryptedApiKey") }),
  }
}

function updatedSecret(existing: string | undefined, value: string | undefined, clear: boolean | undefined, codec: SecretCodec) {
  if (clear && value?.trim()) throw new Error("model_settings_invalid: apiKey and clearApiKey cannot be used together")
  if (clear) return undefined
  if (value !== undefined) return codec.encrypt(requireText(value, "apiKey"))
  return existing
}

function decryptSecret(value: string, codec: SecretCodec) {
  try {
    return requireText(codec.decrypt(value), "decrypted apiKey")
  } catch (error) {
    throw new Error(`model_settings_persistence: saved credential could not be decrypted: ${messageOf(error)}`, { cause: error })
  }
}

function optionalBaseUrl(value: string | undefined) {
  return value?.trim() ? requireBaseUrl(value) : undefined
}

function requireBaseUrl(value: unknown) {
  const text = requireText(value, "baseUrl").replace(/\/$/, "")
  let url: URL
  try {
    url = new URL(text)
  } catch (error) {
    throw new Error("model_settings_invalid: baseUrl must be a valid URL", { cause: error })
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("model_settings_invalid: baseUrl must use HTTPS, except localhost")
  }
  return url.toString().replace(/\/$/, "")
}

function requireImageModel(value: unknown): ImageGenerationModel {
  if (value === "gpt-image-2-cheap" || value === "gpt-image-2") return value
  throw new Error("model_settings_invalid: unsupported image model")
}

function requireText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`model_settings_invalid: ${name} must be a non-empty string`)
  return value.trim()
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
