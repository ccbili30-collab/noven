import { describe, expect, test } from "bun:test"
import { ArtLibraryAssetProtocol } from "../src/art-library-asset-protocol"

describe("art library asset protocol", () => {
  test("serves only hash-verified originals selected by item id", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const protocol = new ArtLibraryAssetProtocol({
      readOriginal: async (id) => {
        if (id !== "art_0123456789abcdef") throw new Error("art_library_missing: unknown")
        return { mediaType: "image/png", bytes }
      },
    })

    const response = await protocol.handle(new Request("creatx-art-library://item/art_0123456789abcdef/original"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect((await protocol.handle(new Request("creatx-art-library://item/art_0123456789abcdef/metadata.json"))).status).toBe(404)
    expect((await protocol.handle(new Request("creatx-art-library://item/..%2F..%2Fsecret/original"))).status).toBe(404)
    expect((await protocol.handle(new Request("creatx-art-library://item/art_ffffffffffffffff/original"))).status).toBe(404)
    expect((await protocol.handle(new Request("creatx-art-library://item/art_0123456789abcdef/original?metadata=true"))).status).toBe(404)
    expect((await protocol.handle(new Request("creatx-art-library://item/art_0123456789abcdef/original", { method: "POST" }))).status).toBe(404)
  })
})
