import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { isIP } from "node:net"
import { dirname } from "node:path"
import { isKnownTextProviderId, isPublicAddress } from "@creatx/contracts"
import type {
  ImageGenerationModel,
  ModelSettingsSnapshot,
  SaveImageModelSettingsCommand,
  SaveTextModelProfileCommand,
  SaveTranscriptionModelSettingsCommand,
  SaveVideoSettingsCommand,
  VideoCookieSourceSetting,
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

export interface TranscriptionModelConnection {
  baseUrl: string
  model: string
  apiKey?: string
  language?: string
}

export interface TextProfileRepairReport {
  repaired: Array<{ id: string; name: string; from: string; to: string }>
  unresolved: Array<{ id: string; name: string; providerId: string }>
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

interface StoredTranscriptionSettings {
  baseUrl?: string
  model?: string
  language?: string
  encryptedApiKey?: string
}

interface StoredVideoSettings {
  cookieSource: VideoCookieSourceSetting
}

// transcription and video are optional and default-filled rather than schemaVersion 2, because
// readSettings fails closed on anything unexpected and every existing models.json predates them.
interface StoredModelSettings {
  schemaVersion: 1
  selectedTextProfileId?: string
  textProfiles: StoredTextProfile[]
  image: StoredImageSettings
  transcription: StoredTranscriptionSettings
  video: StoredVideoSettings
}

const emptySettings = (): StoredModelSettings => ({
  schemaVersion: 1,
  textProfiles: [],
  image: { defaultModel: "gpt-image-2-cheap" },
  transcription: {},
  video: { cookieSource: "noven" },
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
      transcription: {
        ...(this.settings.transcription.baseUrl ? { baseUrl: this.settings.transcription.baseUrl } : {}),
        ...(this.settings.transcription.model ? { model: this.settings.transcription.model } : {}),
        ...(this.settings.transcription.language ? { language: this.settings.transcription.language } : {}),
        apiKeyConfigured: Boolean(this.settings.transcription.encryptedApiKey),
        // A LAN inference box needs no key, so "configured" turns on base URL plus model alone.
        configured: Boolean(this.settings.transcription.baseUrl && this.settings.transcription.model),
      },
      video: { cookieSource: this.settings.video.cookieSource },
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
      providerId: requireKnownProviderId(command.providerId),
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

  saveTranscriptionSettings(command: SaveTranscriptionModelSettingsCommand) {
    const encryptedApiKey = updatedSecret(this.settings.transcription.encryptedApiKey, command.apiKey, command.clearApiKey, this.codec)
    const language = command.language?.trim()
    this.settings = {
      ...this.settings,
      transcription: {
        baseUrl: requireTranscriptionBaseUrl(command.baseUrl),
        model: requireText(command.model, "transcription.model"),
        ...(language ? { language } : {}),
        ...(encryptedApiKey ? { encryptedApiKey } : {}),
      },
    }
    this.persist()
    return this.snapshot()
  }

  saveVideoSettings(command: SaveVideoSettingsCommand) {
    this.settings = { ...this.settings, video: { cookieSource: requireCookieSource(command.cookieSource) } }
    this.persist()
    return this.snapshot()
  }

  resolveTranscriptionConnection(): TranscriptionModelConnection | undefined {
    const transcription = this.settings.transcription
    if (!transcription.baseUrl || !transcription.model) return undefined
    return {
      baseUrl: transcription.baseUrl,
      model: transcription.model,
      ...(transcription.encryptedApiKey ? { apiKey: decryptSecret(transcription.encryptedApiKey, this.codec) } : {}),
      ...(transcription.language ? { language: transcription.language } : {}),
    }
  }

  resolveVideoSettings() {
    return { cookieSource: this.settings.video.cookieSource }
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

  // Bounded startup migration for profiles saved before provider validation existed: a profile
  // whose provider slot holds its own model id is repaired in place — keeping its id, so sessions
  // bound to the profile recover without touching the session database — but only when exactly one
  // sibling profile with the same model and Base URL names a legal provider. Anything else is
  // reported instead of guessed.
  repairLegacyTextProfiles(): TextProfileRepairReport {
    const repaired: TextProfileRepairReport["repaired"] = []
    const unresolved: TextProfileRepairReport["unresolved"] = []
    const textProfiles = this.settings.textProfiles.map((profile) => {
      if (isKnownTextProviderId(profile.providerId)) return profile
      const donorProviderIds = profile.providerId === profile.modelId
        ? new Set(this.settings.textProfiles
          .filter((candidate) => candidate.id !== profile.id
            && isKnownTextProviderId(candidate.providerId)
            && candidate.modelId === profile.modelId
            && (candidate.baseUrl ?? "") === (profile.baseUrl ?? ""))
          .map((candidate) => candidate.providerId))
        : new Set<string>()
      if (donorProviderIds.size !== 1) {
        unresolved.push({ id: profile.id, name: profile.name, providerId: profile.providerId })
        return profile
      }
      const providerId = [...donorProviderIds][0]!
      repaired.push({ id: profile.id, name: profile.name, from: profile.providerId, to: providerId })
      return { ...profile, providerId }
    })
    if (repaired.length) {
      this.settings = { ...this.settings, textProfiles }
      this.persist()
    }
    return { repaired, unresolved }
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
    transcription: readTranscription(value.transcription),
    video: { cookieSource: value.video === undefined ? "noven" : requireCookieSource(isRecord(value.video) ? value.video.cookieSource : undefined) },
  }
}

function readTranscription(value: unknown): StoredTranscriptionSettings {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error("model_settings_persistence: malformed transcription settings")
  return {
    ...(value.baseUrl === undefined ? {} : { baseUrl: requireTranscriptionBaseUrl(value.baseUrl) }),
    ...(value.model === undefined ? {} : { model: requireText(value.model, "transcription.model") }),
    ...(value.language === undefined ? {} : { language: requireText(value.language, "transcription.language") }),
    ...(value.encryptedApiKey === undefined ? {} : { encryptedApiKey: requireText(value.encryptedApiKey, "transcription.encryptedApiKey") }),
  }
}

function requireCookieSource(value: unknown): VideoCookieSourceSetting {
  if (value === "none" || value === "noven" || value === "edge" || value === "firefox" || value === "chrome") return value
  throw new Error("model_settings_invalid: unsupported cookie source")
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

function requireKnownProviderId(value: unknown) {
  const text = requireText(value, "providerId")
  if (!isKnownTextProviderId(text)) throw new Error(`model_settings_invalid: unknown API Provider "${text}"`)
  return text
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

// Deliberately separate from requireBaseUrl: text and image providers must stay HTTPS-or-loopback.
// A self-hosted inference box on the LAN has no public certificate, so plain HTTP is allowed —
// but only to a LITERAL loopback or private-range IP. A hostname over plain HTTP is refused
// because the name could later resolve to a public address, which would ship the user's audio
// somewhere they never configured.
function requireTranscriptionBaseUrl(value: unknown) {
  const text = requireText(value, "transcription.baseUrl").replace(/\/$/, "")
  let url: URL
  try {
    url = new URL(text)
  } catch (error) {
    throw new Error("model_settings_invalid: transcription baseUrl must be a valid URL", { cause: error })
  }
  if (url.username || url.password) throw new Error("model_settings_invalid: transcription baseUrl must not embed credentials")
  if (url.protocol === "https:") return url.toString().replace(/\/$/, "")
  if (url.protocol === "http:" && isTrustedLocalHost(url.hostname)) return url.toString().replace(/\/$/, "")
  throw new Error("model_settings_invalid: transcription baseUrl must use HTTPS, or HTTP with a loopback or private-network IP address")
}

function isTrustedLocalHost(hostname: string) {
  const host = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
  if (host === "localhost") return true
  return isIP(host) !== 0 && !isPublicAddress(host)
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
