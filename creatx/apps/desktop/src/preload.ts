import { contextBridge, ipcRenderer, webUtils } from "electron"
import { CREATX_DESKTOP_API, CREATX_DESKTOP_EVENT, type CreatXDesktopApi, type CreatXEvent } from "@creatx/contracts"
import { droppedAttachmentPaths } from "./dropped-attachments"

const api: CreatXDesktopApi = {
  bootstrap: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "bootstrap"),
  readModelSettings: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "readModelSettings"),
  saveTextModelProfile: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "saveTextModelProfile", command),
  selectSessionModel: (sessionId, profileId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "selectSessionModel", sessionId, profileId),
  saveImageModelSettings: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "saveImageModelSettings", command),
  saveTranscriptionModelSettings: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "saveTranscriptionModelSettings", command),
  saveVideoSettings: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "saveVideoSettings", command),
  readImageTasks: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "readImageTasks", projectId),
  controlImageTask: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "controlImageTask", command),
  chooseProject: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "chooseProject"),
  openProject: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "openProject", projectId),
  revealProject: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "revealProject", projectId),
  createSession: (projectId, title) => ipcRenderer.invoke(CREATX_DESKTOP_API, "createSession", projectId, title),
  renameSession: (sessionId, title) => ipcRenderer.invoke(CREATX_DESKTOP_API, "renameSession", sessionId, title),
  deleteSession: (sessionId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "deleteSession", sessionId),
  deleteProjectSessions: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "deleteProjectSessions", projectId),
  setSessionPermissionMode: (sessionId, mode) => ipcRenderer.invoke(CREATX_DESKTOP_API, "setSessionPermissionMode", sessionId, mode),
  readTimeline: (sessionId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "readTimeline", sessionId),
  sendMessage: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "sendMessage", command),
  steerMessage: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "steerMessage", command),
  admitSharedMessage: (command, delivery) => ipcRenderer.invoke(CREATX_DESKTOP_API, "admitSharedMessage", command, delivery),
  readCreativeLibrary: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "readCreativeLibrary"),
  chooseCreativeLibraryImport: (kind) => ipcRenderer.invoke(CREATX_DESKTOP_API, "chooseCreativeLibraryImport", kind),
  setCreativeLibraryReaction: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "setCreativeLibraryReaction", command),
  bindArtChatSession: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "bindArtChatSession", command),
  readArtLibrary: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "readArtLibrary"),
  reviewArtApproval: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "reviewArtApproval", command),
  exportArtStyleKeywords: (library) => ipcRenderer.invoke(CREATX_DESKTOP_API, "exportArtStyleKeywords", library),
  chooseAttachments: () => ipcRenderer.invoke(CREATX_DESKTOP_API, "chooseAttachments"),
  authorizeDroppedAttachments: (files) => ipcRenderer.invoke(CREATX_DESKTOP_API, "authorizeDroppedAttachments", droppedAttachmentPaths(files, (file) => webUtils.getPathForFile(file))),
  captureWorkbenchAnnotation: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "captureWorkbenchAnnotation", command),
  sampleWorkbenchColor: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "sampleWorkbenchColor", command),
  openMessageAttachment: (sessionId, messageId, attachmentIndex) => ipcRenderer.invoke(CREATX_DESKTOP_API, "openMessageAttachment", sessionId, messageId, attachmentIndex),
  cancelRun: (sessionId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "cancelRun", sessionId),
  respondApproval: (approvalId, approved) => ipcRenderer.invoke(CREATX_DESKTOP_API, "respondApproval", approvalId, approved),
  refreshFiles: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "refreshFiles", projectId),
  readFile: (projectId, fileId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "readFile", projectId, fileId),
  saveTextFile: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "saveTextFile", command),
  readWorkbenches: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "readWorkbenches", projectId),
  resolveWorkbenchPresentation: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "resolveWorkbenchPresentation", command),
  resolveHtmlPresentation: (projectId, fileId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "resolveHtmlPresentation", projectId, fileId),
  readGrowthGoal: (projectId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "readGrowthGoal", projectId),
  pauseGrowth: (goalId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "pauseGrowth", goalId),
  resumeGrowth: (command) => ipcRenderer.invoke(CREATX_DESKTOP_API, "resumeGrowth", command),
  cancelGrowth: (goalId) => ipcRenderer.invoke(CREATX_DESKTOP_API, "cancelGrowth", goalId),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CreatXEvent) => listener(payload)
    ipcRenderer.on(CREATX_DESKTOP_EVENT, handler)
    return () => ipcRenderer.removeListener(CREATX_DESKTOP_EVENT, handler)
  },
}

contextBridge.exposeInMainWorld("creatx", api)
