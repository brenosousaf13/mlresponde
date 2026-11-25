import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createLiveRefreshController, LIVE_REFRESH_DEBOUNCE_MS } from "@/components/perguntas/live-refresh-controller"

function setup(initial: DocumentVisibilityState = "visible") {
  const visibility = Object.assign(new EventTarget(), { visibilityState: initial })
  const refresh = vi.fn()
  const removeListener = vi.spyOn(visibility, "removeEventListener")
  const controller = createLiveRefreshController(refresh, visibility)
  function setVisibility(value: DocumentVisibilityState) {
    visibility.visibilityState = value
    visibility.dispatchEvent(new Event("visibilitychange"))
  }
  return { ...controller, refresh, setVisibility, removeListener }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("LiveRefresh", () => {
  it("agrupa uma rajada em um refresh 4 s após o último evento", () => {
    const controller = setup()
    expect(LIVE_REFRESH_DEBOUNCE_MS).toBe(4000)
    controller.schedule()
    vi.advanceTimersByTime(1000)
    controller.schedule()
    controller.schedule()
    vi.advanceTimersByTime(3999)
    expect(controller.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(8000)
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it("guarda eventos com a aba oculta e atualiza uma vez ao voltar", () => {
    const controller = setup("hidden")
    controller.schedule()
    controller.schedule()
    vi.advanceTimersByTime(10000)
    expect(controller.refresh).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    controller.setVisibility("visible")
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    controller.setVisibility("hidden")
    controller.setVisibility("visible")
    vi.advanceTimersByTime(4000)
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it("não atualiza ao voltar à aba sem pendência", () => {
    const controller = setup("hidden")
    controller.setVisibility("visible")
    vi.advanceTimersByTime(4000)
    expect(controller.refresh).not.toHaveBeenCalled()
    controller.dispose()
  })

  it("preserva o evento quando a aba é ocultada antes do debounce vencer", () => {
    const controller = setup()
    controller.schedule()
    vi.advanceTimersByTime(2000)
    controller.setVisibility("hidden")
    vi.advanceTimersByTime(5000)
    expect(controller.refresh).not.toHaveBeenCalled()
    controller.setVisibility("visible")
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(4000)
    expect(controller.refresh).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it("confere a visibilidade também ao executar o timer", () => {
    const visibility = { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const refresh = vi.fn()
    const controller = createLiveRefreshController(refresh, visibility)
    controller.schedule()
    visibility.visibilityState = "hidden"
    vi.advanceTimersByTime(4000)
    expect(refresh).not.toHaveBeenCalled()
    visibility.visibilityState = "visible"
    visibility.addEventListener.mock.calls[0][1]()
    expect(refresh).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it("aceita uma nova rajada depois do refresh anterior", () => {
    const controller = setup()
    controller.schedule()
    vi.advanceTimersByTime(4000)
    controller.schedule()
    vi.advanceTimersByTime(4000)
    expect(controller.refresh).toHaveBeenCalledTimes(2)
    controller.dispose()
  })

  it.each(["visible", "hidden"] as const)("limpa timer e listener ao desmontar com a aba %s", (visibility) => {
    const controller = setup(visibility)
    controller.schedule()
    controller.dispose()
    expect(controller.removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    controller.setVisibility("visible")
    controller.schedule()
    vi.advanceTimersByTime(10000)
    expect(controller.refresh).not.toHaveBeenCalled()
  })
})
