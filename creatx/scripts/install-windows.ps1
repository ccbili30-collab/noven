$ErrorActionPreference = "Stop"

& bun install --frozen-lockfile
exit $LASTEXITCODE
