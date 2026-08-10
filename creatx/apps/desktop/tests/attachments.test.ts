import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AttachmentAuthorizationStore } from "../src/attachments"
import { ConversationAttachmentProtocol } from "../src/conversation-attachment-protocol"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("attachment authorization store", () => {
  test("authorizes multiple files and consumes unguessable process-local IDs", async () => {
    const root = await temporaryDirectory()
    const first = join(root, "参考一.md")
    const second = join(root, "参考二.txt")
    await writeFile(first, "one", "utf8")
    await writeFile(second, "two", "utf8")
    const ids = ["token-a", "token-b"]
    const store = new AttachmentAuthorizationStore({ id: () => ids.shift()!, now: () => 100 })

    const references = await store.authorize([first, second])
    expect(references.map((reference) => ({ id: reference.id, name: reference.name, displayPath: reference.displayPath }))).toEqual([
      { id: "token-a", name: "参考一.md", displayPath: "参考一.md" },
      { id: "token-b", name: "参考二.txt", displayPath: "参考二.txt" },
    ])
    await expect(store.resolve(references.map((reference) => reference.id))).resolves.toEqual({ userFiles: [first, second], userImages: [], imageSnapshots: [] })
    store.consume(references.map((reference) => reference.id))
    await expect(store.resolve(["token-a"])).rejects.toThrow("attachment_invalid")
  })

  test("rejects forged, duplicate, expired, changed, missing and non-file selections", async () => {
    const root = await temporaryDirectory()
    const file = join(root, "参考.md")
    await writeFile(file, "before", "utf8")
    let now = 100
    const store = new AttachmentAuthorizationStore({ id: () => `token-${now}`, now: () => now, ttlMs: 10 })
    const reference = (await store.authorize([file]))[0]!

    await expect(store.resolve(["forged"])).rejects.toThrow("attachment_invalid")
    await expect(store.resolve([reference.id, reference.id])).rejects.toThrow("attachment_invalid")
    await writeFile(file, "changed content", "utf8")
    await expect(store.resolve([reference.id])).rejects.toThrow("attachment_invalid")

    const missing = (await store.authorize([file]))[0]!
    await rm(file)
    await expect(store.resolve([missing.id])).rejects.toThrow("attachment_missing")
    await expect(store.authorize([root])).rejects.toThrow("attachment_unreadable")

    await writeFile(file, "restored", "utf8")
    const expired = (await store.authorize([file]))[0]!
    now = 111
    await expect(store.resolve([expired.id])).rejects.toThrow("attachment_invalid")
  })

  test("does not retain a partial authorization when one selected file is invalid", async () => {
    const root = await temporaryDirectory()
    const file = join(root, "有效.md")
    await writeFile(file, "content", "utf8")
    const store = new AttachmentAuthorizationStore({ id: () => "partial-token" })

    await expect(store.authorize([file, root])).rejects.toThrow("attachment_unreadable")
    await expect(store.resolve(["partial-token"])).rejects.toThrow("attachment_invalid")
  })

  test("classifies a real PNG for preview and visual delivery", async () => {
    const root = await temporaryDirectory()
    const image = join(root, "参考图.png")
    await writeFile(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"))
    const store = new AttachmentAuthorizationStore({ id: () => "image-token" })

    const [reference] = await store.authorize([image])
    expect(reference).toMatchObject({ id: "image-token", kind: "image", mediaType: "image/png" })
    expect(reference?.previewUrl).toBe("creatx-attachment://pending/image-token")
    const resolved = await store.resolve([reference!.id])
    const snapshot = resolved.imageSnapshots[0]!
    const modelImage = resolved.userImages[0]!
    await writeFile(image, "changed after resolve", "utf8")
    expect(modelImage).toMatch(/^data:image\/png;base64,/)
    expect(snapshot).toMatchObject({ index: 0, displayName: "参考图.png", mediaType: "image/png", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(Buffer.from(snapshot.bytes).toString("base64")).toBe(modelImage.split(",")[1]!)
  })

  test("authorizes a Main-generated PNG without creating a temporary project file", async () => {
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    const store = new AttachmentAuthorizationStore({ id: () => "generated-token", now: () => 100 })

    const reference = store.authorizeGeneratedPng(bytes, "世界地图-批注.png")
    expect(reference).toMatchObject({ id: "generated-token", name: "世界地图-批注.png", displayPath: "工作台批注", kind: "image", mediaType: "image/png", size: bytes.length })
    await expect(store.preview(reference.id)).resolves.toEqual({ mediaType: "image/png", bytes })
    await expect(store.resolve([reference.id])).resolves.toEqual({
      userFiles: [],
      userImages: [`data:image/png;base64,${bytes.toString("base64")}`],
      imageSnapshots: [{ index: 0, displayName: "世界地图-批注.png", mediaType: "image/png", bytes: new Uint8Array(bytes), sha256: createHash("sha256").update(bytes).digest("hex") }],
    })
    store.consume([reference.id])
    await expect(store.resolve([reference.id])).rejects.toThrow("attachment_invalid")
    await expect(store.preview(reference.id)).resolves.toEqual({ mediaType: "image/png", bytes })
  })

  test("rejects forged and oversized Main-generated PNG bytes", () => {
    const store = new AttachmentAuthorizationStore({ maxImageBytes: 16 })
    expect(() => store.authorizeGeneratedPng(Buffer.from("not png"), "批注.png")).toThrow("attachment_invalid")
    expect(() => store.authorizeGeneratedPng(Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(16)]), "批注.png")).toThrow("attachment_invalid")
  })

  test("rejects forged images, unsupported binary files and an oversized image batch", async () => {
    const root = await temporaryDirectory()
    const forged = join(root, "伪造.png")
    const binary = join(root, "内容.bin")
    const large = join(root, "过大.png")
    await writeFile(forged, "not an image", "utf8")
    await writeFile(binary, Buffer.from([0, 1, 2, 3]))
    await writeFile(large, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(64)]))
    const store = new AttachmentAuthorizationStore({ maxImageBytes: 32 })

    await expect(store.authorize([forged])).rejects.toThrow("attachment_invalid")
    await expect(store.authorize([binary])).rejects.toThrow("attachment_unreadable")
    await expect(store.authorize([large])).rejects.toThrow("attachment_invalid")
  })

  test("serves pending and persisted images only through constrained attachment URLs", async () => {
    const root = await temporaryDirectory()
    const image = join(root, "参考图.png")
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    await writeFile(image, bytes)
    const store = new AttachmentAuthorizationStore({ id: () => "pending-token" })
    await store.authorize([image])
    const protocol = new ConversationAttachmentProtocol(store, async (sessionId, messageId, index) => {
      expect({ sessionId, messageId, index }).toEqual({ sessionId: "session-1", messageId: "message:1", index: 0 })
      return { mediaType: "image/png", bytes }
    })

    expect((await protocol.handle(new Request("creatx-attachment://pending/pending-token"))).status).toBe(200)
    expect((await protocol.handle(new Request("creatx-attachment://message/session-1/message%3A1/0"))).status).toBe(200)
    expect((await protocol.handle(new Request("creatx-attachment://message/session-1/message%3A1/not-a-number"))).status).toBe(404)
  })
})

async function temporaryDirectory() {
  const root = await mkdtemp(join(tmpdir(), "creatx-attachment-auth-"))
  roots.push(root)
  return root
}
