export async function runBeforeDeadline<T>(execute: () => Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  })
  const result = await Promise.race([
    execute().then((value) => ({ timedOut: false as const, value })),
    timeout,
  ])
  if (timer) clearTimeout(timer)
  return result
}
