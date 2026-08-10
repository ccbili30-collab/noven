# CreatX Desktop Walking Skeleton

This workspace contains the first production Electron + Cline Walking Skeleton（可运行骨架）.

## Windows Setup

Node.js 22 or newer and Bun 1.3.14 are required. From this directory run:

```powershell
bun run install:windows
```

The script runs `bun install --frozen-lockfile`. `bunfig.toml` fixes Bun to the Hoisted Linker（提升式链接器） so Windows installations do not create the deeper Isolated Store paths that exceed the traditional path limit for Cline's SAP AI SDK dependencies. Installation failures remain fatal; the script does not copy packages from caches or older dependency trees.

## Verification

```powershell
bun run typecheck
bun test
bun run test:imports
bun run build
bun run test:desktop
bun run test:live
bun run test:electron-live
bun run test:image-live
```

`test:live` and `test:electron-live` require `DEEPSEEK_API_KEY`. They fail closed when it is missing.
`test:image-live` requires `CREATX_IMAGE_BASE_URL` and `CREATX_IMAGE_API_KEY` in the local environment or ignored `.env.local`. It performs paid requests to both configured pilot models and writes verified images into a unique project below `tmp/image-provider-live-projects`.
