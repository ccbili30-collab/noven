// UI affordance only. This decides whether a pasted or dropped blob looks enough like a 抖音
// share to offer analyzing it, so it is deliberately permissive. The authoritative parse, host
// allowlist and canonical form live in analyze_video inside the main process — nothing here is
// a security boundary and nothing here may be treated as validation.
const douyinLink = /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9_-]{4,32}|(?:www\.)?(?:douyin|iesdouyin)\.com\/[^\s<>"'）)】]+)/u

export function findDouyinLink(input: string) {
  return input.match(douyinLink)?.[0].replace(/[.,;:!?、，。！？]+$/u, "")
}

export function douyinAnalysisPrompt(url: string) {
  return `请看懂这条抖音视频并回答我的问题：${url}\n\n`
}

// A share is normally pasted as a whole sentence, so replacing the draft outright is only safe
// when there is nothing to lose; otherwise the link is appended to whatever is already typed.
export function draftWithDouyinLink(draft: string, url: string) {
  return draft.trim() ? `${draft.replace(/\s*$/u, "")}\n${url}\n` : douyinAnalysisPrompt(url)
}
