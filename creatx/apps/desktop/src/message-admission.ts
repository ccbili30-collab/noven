export function waitForMessageAdmission(
  execute: (onAdmitted: () => void) => Promise<unknown>,
  onBackgroundFailure: (error: unknown) => void | Promise<void>,
) {
  return new Promise<void>((resolve, reject) => {
    let admitted = false
    let settled = false
    const execution = Promise.resolve().then(() => execute(() => {
      if (admitted) return
      admitted = true
      settled = true
      resolve()
    }))
    void execution.then(() => {
      if (admitted || settled) return
      settled = true
      reject(new Error("message_admission_missing: message delivery completed without Runtime admission"))
    }, (error) => {
      if (!admitted) {
        if (settled) return
        settled = true
        reject(error)
        return
      }
      void Promise.resolve(onBackgroundFailure(error)).catch(() => undefined)
    })
  })
}
