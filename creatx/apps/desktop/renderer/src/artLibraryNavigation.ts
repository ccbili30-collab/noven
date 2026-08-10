export const bundledArtLibraryPath = "./art-library/art-atlas.html"

export function resolveArtLibraryUrl() {
  const configured = import.meta.env.VITE_ART_LIBRARY_URL?.trim()
  return configured || new URL(bundledArtLibraryPath, location.href).href
}
