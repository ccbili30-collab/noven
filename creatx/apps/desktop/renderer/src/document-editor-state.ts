export interface DocumentEditorState {
  fileId: string
  content: string
  baseline: string
  modifiedAt: string
  dirty: boolean
  undoStack: string[]
  redoStack: string[]
}

const historyLimit = 100

export function openDocument(input: { fileId: string; content: string; modifiedAt: string }): DocumentEditorState {
  return { ...input, baseline: input.content, dirty: false, undoStack: [], redoStack: [] }
}

export function editDocument(state: DocumentEditorState, content: string): DocumentEditorState {
  if (content === state.content) return state
  return {
    ...state,
    content,
    dirty: content !== state.baseline,
    undoStack: [...state.undoStack, state.content].slice(-historyLimit),
    redoStack: [],
  }
}

export function undoDocument(state: DocumentEditorState): DocumentEditorState {
  const content = state.undoStack.at(-1)
  if (content === undefined) return state
  return {
    ...state,
    content,
    dirty: content !== state.baseline,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [state.content, ...state.redoStack].slice(0, historyLimit),
  }
}

export function redoDocument(state: DocumentEditorState): DocumentEditorState {
  const content = state.redoStack[0]
  if (content === undefined) return state
  return {
    ...state,
    content,
    dirty: content !== state.baseline,
    undoStack: [...state.undoStack, state.content].slice(-historyLimit),
    redoStack: state.redoStack.slice(1),
  }
}

export function saveDocument(state: DocumentEditorState, modifiedAt: string): DocumentEditorState {
  return { ...state, baseline: state.content, modifiedAt, dirty: false, undoStack: [], redoStack: [] }
}
