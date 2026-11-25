export const LIVE_REFRESH_DEBOUNCE_MS = 4000

type VisibilitySource = {
  readonly visibilityState: string
  addEventListener(type: "visibilitychange", listener: () => void): void
  removeEventListener(type: "visibilitychange", listener: () => void): void
}

/** Agrupa eventos e adia a atualização até a aba ficar visível. */
export function createLiveRefreshController(refresh: () => void, visibility: VisibilitySource) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let disposed = false

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function flush() {
    timer = null
    if (disposed || !pending || visibility.visibilityState === "hidden") return
    pending = false
    refresh()
  }

  function onVisibilityChange() {
    clearTimer()
    if (visibility.visibilityState === "visible") flush()
  }

  visibility.addEventListener("visibilitychange", onVisibilityChange)

  return {
    schedule() {
      if (disposed) return
      pending = true
      clearTimer()
      if (visibility.visibilityState !== "hidden") {
        timer = setTimeout(flush, LIVE_REFRESH_DEBOUNCE_MS)
      }
    },
    dispose() {
      disposed = true
      pending = false
      clearTimer()
      visibility.removeEventListener("visibilitychange", onVisibilityChange)
    },
  }
}
