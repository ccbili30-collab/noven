# CreatX Art Library

This package owns the static Art Atlas experience bundled with CreatX.

- Runtime files live under `public/art-library/` and are copied unchanged by the Electron and Web Preview Vite builds.
- The imported source is `D:\CodexW\my-art` commit `95b298f`.
- Browsing, artwork details, and the local approval demo are included.
- Source-data generators and the writable registration server are excluded because they depend on the separate `notes/reference/**/original/` archive.
- The Renderer opens this package as a separate visual space; it does not expose Electron, Cline, Provider, or project-file APIs.
