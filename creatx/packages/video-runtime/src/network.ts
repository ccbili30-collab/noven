import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { isPublicAddress } from "@creatx/contracts"

export type ResolveHost = (hostname: string) => Promise<string[]>

// The host allowlist already restricts this to four 抖音 names, but a hosts-file entry or a
// poisoned resolver could still point one of them at the loopback interface, and yt-dlp would
// happily fetch it. Refusing a private answer keeps the download from becoming a local read.
export async function requirePublicVideoTarget(url: string, resolveHost?: ResolveHost) {
  const hostname = new URL(url).hostname
  const resolve = resolveHost ?? (async (host: string) => (await lookup(host, { all: true })).map((entry) => entry.address))
  const addresses = isIP(hostname) ? [hostname] : await resolve(hostname).catch((error) => {
    throw new Error(`video_network: 无法解析 ${hostname}：${error instanceof Error ? error.message : String(error)}`)
  })
  if (!addresses.length) throw new Error(`video_network: ${hostname} 没有解析到任何地址。`)
  if (addresses.some((address) => !isPublicAddress(address))) throw new Error(`video_network: ${hostname} 解析到了非公网地址，已拒绝下载。`)
  return addresses
}
