import { createShellExecutor } from "@cline/sdk"

const WINDOWS_UTF8_PREAMBLE = [
  "[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)",
  "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
  "$OutputEncoding = [Text.UTF8Encoding]::new($false)",
].join("; ")

export function createCreatXShellExecutor(platform = process.platform) {
  const execute = createShellExecutor(platform === "win32" ? { shell: "powershell.exe" } : {})
  if (platform !== "win32") return execute
  const utf8Execute: typeof execute = (command, cwd, context) => execute(
    typeof command === "string" ? `${WINDOWS_UTF8_PREAMBLE}; ${command}` : command,
    cwd,
    context,
  )
  return utf8Execute
}
