import type { ProjectInternalStatePort } from "@creatx/project-files"
import { parsePortableProjectId, parsePortableProjectOverviewV1, type PortableProjectOverviewV1 } from "./schema.ts"

export interface PortableProjectMetadataV1 {
  schemaVersion: 1
  projectId: string
  forkedFromProjectId?: string
  overview: PortableProjectOverviewV1
}

export interface PortableProjectMetadataRecord {
  metadata: PortableProjectMetadataV1
  modifiedAt: string
}

export interface InitializePortableProjectMetadataInput {
  localProjectId: string
  projectId: string
  forkedFromProjectId?: string
  overview: PortableProjectOverviewV1
}

const namespace = "portable-project"
const key = "metadata.v1.json"
const metadataKeys = new Set(["schemaVersion", "projectId", "forkedFromProjectId", "overview"])

export class PortableProjectMetadataStore {
  private readonly internal: ProjectInternalStatePort

  constructor(internal: ProjectInternalStatePort) {
    this.internal = internal
  }

  async read(localProjectId: string): Promise<PortableProjectMetadataRecord | undefined> {
    const record = await this.internal.readFile(localProjectId, namespace, key)
    if (!record) return undefined
    return { metadata: parseMetadata(record.bytes), modifiedAt: record.modifiedAt }
  }

  async initialize(input: InitializePortableProjectMetadataInput) {
    const metadata = requireMetadataInput(input)
    const existing = await this.read(input.localProjectId)
    if (existing) {
      if (existing.metadata.projectId !== metadata.projectId || existing.metadata.forkedFromProjectId !== metadata.forkedFromProjectId) throw new Error("package_identity_conflict: project portable lineage is already initialized")
      return existing
    }
    return toMetadataRecord(await this.internal.writeFile({
      projectId: input.localProjectId,
      namespace,
      key,
      content: `${JSON.stringify(metadata, undefined, 2)}\n`,
      expectedModifiedAt: null,
    }))
  }

  initializeLocal(localProjectId: string, overview: PortableProjectOverviewV1) {
    return this.initialize({ localProjectId, projectId: localProjectId, overview })
  }

  async saveOverview(localProjectId: string, overviewValue: PortableProjectOverviewV1) {
    const overview = parsePortableProjectOverviewV1(overviewValue)
    const existing = await this.read(localProjectId)
    if (!existing) return this.initializeLocal(localProjectId, overview)
    const metadata = { ...existing.metadata, overview }
    return toMetadataRecord(await this.internal.writeFile({
      projectId: localProjectId,
      namespace,
      key,
      content: `${JSON.stringify(metadata, undefined, 2)}\n`,
      expectedModifiedAt: existing.modifiedAt,
    }))
  }
}

function requireMetadataInput(input: InitializePortableProjectMetadataInput): PortableProjectMetadataV1 {
  const projectId = parsePortableProjectId(input.projectId)
  const forkedFromProjectId = input.forkedFromProjectId === undefined ? undefined : parsePortableProjectId(input.forkedFromProjectId, "forkedFromProjectId")
  if (forkedFromProjectId === projectId) throw new Error("package_metadata_invalid: forked lineage must differ from project identity")
  return {
    schemaVersion: 1,
    projectId,
    ...(forkedFromProjectId ? { forkedFromProjectId } : {}),
    overview: parsePortableProjectOverviewV1(input.overview),
  }
}

function parseMetadata(bytes: Uint8Array): PortableProjectMetadataV1 {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error("package_metadata_invalid: metadata is not valid JSON")
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("package_metadata_invalid: metadata must be an object")
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1 || Object.keys(record).some((field) => !metadataKeys.has(field)) || ["projectId", "overview"].some((field) => !(field in record))) throw new Error("package_metadata_invalid: metadata schema is invalid")
  try {
    return requireMetadataInput({
      localProjectId: "read-only",
      projectId: record.projectId as string,
      ...(record.forkedFromProjectId !== undefined ? { forkedFromProjectId: record.forkedFromProjectId as string } : {}),
      overview: record.overview as PortableProjectOverviewV1,
    })
  } catch (error) {
    throw new Error(`package_metadata_invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function toMetadataRecord(record: { bytes: Uint8Array; modifiedAt: string }): PortableProjectMetadataRecord {
  return { metadata: parseMetadata(record.bytes), modifiedAt: record.modifiedAt }
}
