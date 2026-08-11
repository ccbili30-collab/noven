// Shared outbound-target guard. Any runtime that resolves a user-supplied hostname before
// connecting must reject answers that point back into the machine or the local network,
// otherwise a public URL becomes a read primitive against localhost services.
export function isPublicAddress(input: string): boolean {
  const address = input.toLowerCase().split("%", 1)[0] ?? ""
  if (address.includes(":")) {
    if (address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || /^fe[89ab]/u.test(address) || address.startsWith("fec") || address.startsWith("fed") || address.startsWith("fee") || address.startsWith("fef") || address.startsWith("ff") || address.startsWith("2001:db8:")) return false
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1]
    return mapped ? isPublicAddress(mapped) : true
  }
  const parts = address.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  if (parts[0]! === 0 || parts[0]! === 10 || parts[0]! === 127 || parts[0]! >= 224) return false
  if (parts[0]! === 169 && parts[1]! === 254) return false
  if (parts[0]! === 172 && parts[1]! >= 16 && parts[1]! <= 31) return false
  if (parts[0]! === 192 && parts[1]! === 168) return false
  if (parts[0]! === 100 && parts[1]! >= 64 && parts[1]! <= 127) return false
  if (parts[0]! === 192 && parts[1]! === 0) return false
  if (parts[0]! === 198 && (parts[1]! === 18 || parts[1]! === 19 || parts[1]! === 51 && parts[2]! === 100)) return false
  return !(parts[0]! === 192 && parts[1]! === 0 && parts[2]! === 2) && !(parts[0]! === 203 && parts[1]! === 0 && parts[2]! === 113)
}
