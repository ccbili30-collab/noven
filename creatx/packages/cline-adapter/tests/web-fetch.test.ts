import { afterEach, describe, expect, test } from "bun:test"
import { createServer, type RequestListener, type Server } from "node:http"
import { EnvHttpProxyAgent } from "undici"
import { createProxyAwareWebFetchExecutor, disposeProviderDispatcher } from "../src"

const servers: Server[] = []
const dispatchers: EnvHttpProxyAgent[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })))
  await Promise.all(dispatchers.splice(0).map((dispatcher) => disposeProviderDispatcher(dispatcher)))
})

describe("proxy-aware Cline web fetch", () => {
  test("reads HTML through the supplied dispatcher and preserves the analysis request", async () => {
    const url = await serve((_, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8")
      response.end("<html><style>.hidden{display:none}</style><script>SECRET_SCRIPT</script><h1>World Notes</h1><p>Alpha &amp; Beta</p></html>")
    })
    const executor = createProxyAwareWebFetchExecutor(dispatcher())

    const output = await executor(url, "Extract the world notes", { agentId: "test-agent", iteration: 1 })

    expect(output).toContain("World Notes Alpha & Beta")
    expect(output).toContain("Prompt: Extract the world notes")
    expect(output).not.toContain("SECRET_SCRIPT")
  })

  test("fails closed for unsupported protocols", async () => {
    const executor = createProxyAwareWebFetchExecutor(dispatcher())

    await expect(executor("file:///C:/secret.txt", "Read it", { agentId: "test-agent", iteration: 1 }))
      .rejects.toThrow("Only http and https are supported")
  })

  test("preserves the remote HTTP status", async () => {
    const url = await serve((_, response) => {
      response.statusCode = 503
      response.statusMessage = "Service Unavailable"
      response.end("unavailable")
    })
    const executor = createProxyAwareWebFetchExecutor(dispatcher())

    await expect(executor(url, "Read it", { agentId: "test-agent", iteration: 1 }))
      .rejects.toThrow("HTTP 503: Service Unavailable")
  })
})

function dispatcher() {
  const value = new EnvHttpProxyAgent({ noProxy: "*" })
  dispatchers.push(value)
  return value
}

async function serve(handler: RequestListener) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP port")
  return `http://127.0.0.1:${address.port}`
}
