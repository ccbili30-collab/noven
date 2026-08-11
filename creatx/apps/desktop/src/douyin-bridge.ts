// Build entry that exposes the 抖音 analysis path to the live acceptance script. The extractor
// needs a real Electron main process, so the test cannot import the TypeScript sources directly;
// electron-vite bundles this alongside main.js and the script imports the built output.
export { DouyinPageExtractor } from "./douyin-page-extractor.ts"
export { VideoAnalysisService, resolveVideoBinaries } from "@creatx/video-runtime"
