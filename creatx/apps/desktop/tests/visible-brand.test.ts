import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { VISIBLE_PRODUCT_NAME } from "../src/product-brand.ts"

const projectRoot = new URL("../../../", import.meta.url)

test("uses 诺文 on visible desktop packaging while preserving CreatX compatibility identities", async () => {
  const builderConfig = await readFile(new URL("electron-builder.yml", projectRoot), "utf8")
  const packageConfig = JSON.parse(await readFile(new URL("package.json", projectRoot), "utf8")) as { name: string; description: string; author: string }

  expect(VISIBLE_PRODUCT_NAME).toBe("诺文")
  expect(builderConfig).toContain("appId: com.creatx.desktop")
  expect(builderConfig).toContain("productName: 诺文")
  expect(builderConfig).toContain("executableName: 诺文")
  expect(builderConfig).toContain("shortcutName: 诺文")
  expect(packageConfig).toEqual(expect.objectContaining({ name: "creatx", description: "诺文 AI creative workspace", author: "诺文" }))
})
