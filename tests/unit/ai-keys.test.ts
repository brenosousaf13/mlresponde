import { randomBytes } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseAiKeyForm } from "@/lib/admin/schemas"
import { aiKeyFingerprint, openSealedAiKey, sealAiKey } from "@/lib/ai/key-crypto"
import {
  classifyOpenAIError,
  effectiveKeySource,
  isRejectedKeyError,
  normalizeOpenAIKey,
  openAIKeyHint,
  redactSecrets,
} from "@/lib/ai/keys"

const PROJECT_KEY = `sk-proj-${"A1b2C3d4E5".repeat(8)}_-xYz9`

describe("chave colada no painel", () => {
  it("limpa espaços, quebras de linha, aspas e o nome da variável", () => {
    expect(normalizeOpenAIKey(`  ${PROJECT_KEY}\n`)).toEqual({ ok: true, key: PROJECT_KEY })
    expect(normalizeOpenAIKey(`"${PROJECT_KEY}"`)).toEqual({ ok: true, key: PROJECT_KEY })
    expect(normalizeOpenAIKey(`OPENAI_API_KEY=${PROJECT_KEY}`)).toEqual({ ok: true, key: PROJECT_KEY })
    expect(normalizeOpenAIKey(`export OPENAI_API_KEY='${PROJECT_KEY}'`)).toEqual({ ok: true, key: PROJECT_KEY })
    expect(normalizeOpenAIKey(PROJECT_KEY.slice(0, 40) + "\n" + PROJECT_KEY.slice(40))).toEqual({ ok: true, key: PROJECT_KEY })
  })

  it("recusa vazio, formato estranho e chave de administração", () => {
    expect(normalizeOpenAIKey("").ok).toBe(false)
    expect(normalizeOpenAIKey(null).ok).toBe(false)
    expect(normalizeOpenAIKey("minha-chave").ok).toBe(false)
    expect(normalizeOpenAIKey("sk-curta").ok).toBe(false)
    expect(normalizeOpenAIKey("sk-proj-com espaço no meio mas curta").ok).toBe(false)
    const admin = normalizeOpenAIKey(`sk-admin-${"x".repeat(40)}`)
    expect(admin.ok).toBe(false)
    if (!admin.ok) expect(admin.message).toMatch(/administração/)
  })

  it("mostra só o tipo e os 4 últimos caracteres", () => {
    expect(openAIKeyHint(PROJECT_KEY)).toBe("sk-proj-…xYz9")
    expect(openAIKeyHint(`sk-svcacct-${"a".repeat(30)}wxyz`)).toBe("sk-svcacct-…wxyz")
    expect(openAIKeyHint(`sk-${"a".repeat(30)}1234`)).toBe("sk-…1234")
  })

  it("formulário: nome obrigatório e a chave nunca volta em caso de erro", () => {
    const form = (entries: Record<string, string>) => {
      const data = new FormData()
      for (const [key, value] of Object.entries(entries)) data.set(key, value)
      return data
    }
    const ok = parseAiKeyForm(form({ label: "  Produção   out/2026 ", key: PROJECT_KEY, activate: "on" }))
    expect(ok).toEqual({ success: true, data: { label: "Produção out/2026", key: PROJECT_KEY, activate: true } })
    const reserve = parseAiKeyForm(form({ label: "Reserva", key: PROJECT_KEY }))
    expect(reserve.success && reserve.data.activate).toBe(false)
    const bad = parseAiKeyForm(form({ label: "", key: "sk-errada" }))
    expect(bad.success).toBe(false)
    if (!bad.success) {
      expect(Object.keys(bad.fieldErrors).sort()).toEqual(["key", "label"])
      expect(JSON.stringify(bad)).not.toContain("sk-errada")
    }
    const long = parseAiKeyForm(form({ label: "x".repeat(81), key: PROJECT_KEY }))
    expect(long.success).toBe(false)
  })
})

describe("criptografia das chaves de IA", () => {
  const master = randomBytes(32)
  const id = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f"

  it("tranca e abre a mesma chave, sem o valor aparecer no conteúdo gravado", () => {
    const sealed = sealAiKey(id, PROJECT_KEY, master)
    expect(sealed.ciphertext.startsWith("v1.")).toBe(true)
    expect(sealed.ciphertext).not.toContain("sk-")
    expect(sealed.hint).toBe("sk-proj-…xYz9")
    expect(sealed.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(openSealedAiKey(id, sealed.ciphertext, master)).toBe(PROJECT_KEY)
  })

  it("não abre em outra linha nem com outra chave-mestra", () => {
    const sealed = sealAiKey(id, PROJECT_KEY, master)
    expect(() => openSealedAiKey("00000000-0000-4000-8000-000000000000", sealed.ciphertext, master)).toThrow()
    expect(() => openSealedAiKey(id, sealed.ciphertext, randomBytes(32))).toThrow()
  })

  it("impressão digital estável por chave-mestra (detecta cadastro repetido)", () => {
    expect(aiKeyFingerprint(PROJECT_KEY, master)).toBe(aiKeyFingerprint(PROJECT_KEY, master))
    expect(aiKeyFingerprint(PROJECT_KEY, master)).not.toBe(aiKeyFingerprint(`${PROJECT_KEY}0`, master))
    expect(aiKeyFingerprint(PROJECT_KEY, master)).not.toBe(aiKeyFingerprint(PROJECT_KEY, randomBytes(32)))
  })
})

describe("erros da OpenAI", () => {
  it("explica cada erro do teste da chave", () => {
    expect(classifyOpenAIError({ status: 401, code: "invalid_api_key" }, "gpt-6-luna").kind).toBe("invalid_key")
    expect(classifyOpenAIError({ status: 403 }, "gpt-6-luna")).toMatchObject({ kind: "permission" })
    expect(classifyOpenAIError({ status: 403 }, "gpt-6-luna").message).toContain("gpt-6-luna")
    expect(classifyOpenAIError({ status: 404, code: "model_not_found" }, "gpt-6-luna").kind).toBe("model")
    expect(classifyOpenAIError({ status: 429, code: "insufficient_quota" }, "m").kind).toBe("quota")
    expect(classifyOpenAIError({ status: 429, code: "rate_limit_exceeded" }, "m").kind).toBe("rate_limit")
    expect(classifyOpenAIError({ name: "APIConnectionTimeoutError" }, "m").kind).toBe("connection")
    expect(classifyOpenAIError({ status: 500 }, "m").message).toContain("500")
    expect(classifyOpenAIError(new Error("x"), "m").kind).toBe("unknown")
  })

  it("só a recusa da chave (401) troca para a reserva", () => {
    expect(isRejectedKeyError({ status: 401 })).toBe(true)
    expect(isRejectedKeyError({ status: 429 })).toBe(false)
    expect(isRejectedKeyError({ status: 500 })).toBe(false)
    expect(isRejectedKeyError(new Error("401"))).toBe(false)
    expect(isRejectedKeyError(null)).toBe(false)
  })

  it("tira pedaços de chave das mensagens", () => {
    const message = "Incorrect API key provided: sk-proj-****************************abcd. You can find your API key at"
    expect(redactSecrets(message)).toBe("Incorrect API key provided: sk-…. You can find your API key at")
    expect(redactSecrets(`falhou com ${PROJECT_KEY} aqui`)).toBe("falhou com sk-… aqui")
    expect(redactSecrets("sem chave nenhuma")).toBe("sem chave nenhuma")
  })

  it("ordem de uso: painel → variável → nenhuma", () => {
    expect(effectiveKeySource({ hasActivePanelKey: true, encryptionReady: true, envConfigured: true })).toBe("panel")
    expect(effectiveKeySource({ hasActivePanelKey: true, encryptionReady: false, envConfigured: true })).toBe("env")
    expect(effectiveKeySource({ hasActivePanelKey: false, encryptionReady: true, envConfigured: true })).toBe("env")
    expect(effectiveKeySource({ hasActivePanelKey: true, encryptionReady: false, envConfigured: false })).toBe("none")
  })
})

// ------------------------------------------------------------------ troca automática (banco e OpenAI simulados)

const mocks = vi.hoisted(() => {
  const inserted: Record<string, unknown>[] = []
  const state = { paused: false }
  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table === "platform_settings" ? { ai_paused: state.paused } : null, error: null }) }),
      }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row)
        return { error: null }
      },
    }),
  }
  return {
    inserted,
    state,
    supabase,
    resolveOpenAIKey: vi.fn(),
    reportRejectedOpenAIKey: vi.fn(async () => undefined),
    envOpenAIKey: vi.fn(),
  }
})

vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => mocks.supabase }))
vi.mock("@/lib/ai/key-store", () => ({
  resolveOpenAIKey: mocks.resolveOpenAIKey,
  reportRejectedOpenAIKey: mocks.reportRejectedOpenAIKey,
  envOpenAIKey: mocks.envOpenAIKey,
  openAIClientFor: (key: { label: string }) => ({ label: key.label }),
  MissingOpenAIKeyError: class MissingOpenAIKeyError extends Error {},
}))

const { PlatformAiPausedError, trackedCompletion } = await import("@/lib/ai/usage")

const ACTIVE = { id: "key-ativa", source: "panel", label: "ativa", apiKey: "sk-a" } as const
const STANDBY = { id: "key-reserva", source: "panel", label: "reserva", apiKey: "sk-b" } as const
const ENV = { id: null, source: "env", label: "OPENAI_API_KEY", apiKey: "sk-env" } as const
const CONTEXT = { feature: "question_answer", organizationId: "org-1" } as const
const usage = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 }
const rejected = Object.assign(new Error("Incorrect API key provided: sk-proj-****abcd"), { status: 401 })

describe("trackedCompletion com chaves do painel", () => {
  beforeEach(() => {
    mocks.inserted.length = 0
    mocks.state.paused = false
    mocks.resolveOpenAIKey.mockReset()
    mocks.reportRejectedOpenAIKey.mockClear()
    mocks.envOpenAIKey.mockReset()
  })

  it("usa a chave em uso e registra qual foi", async () => {
    mocks.resolveOpenAIKey.mockResolvedValue(ACTIVE)
    const call = vi.fn(async (client: unknown) => ({ client, usage }))
    const result = await trackedCompletion(CONTEXT, "gpt-6-luna", call as never)
    expect((result as { client: { label: string } }).client.label).toBe("ativa")
    expect(mocks.inserted).toHaveLength(1)
    expect(mocks.inserted[0]).toMatchObject({ success: true, ai_key_id: "key-ativa", key_source: "panel", input_tokens: 100 })
  })

  it("chave recusada (401): avisa o banco, troca pela reserva e repete uma vez", async () => {
    mocks.resolveOpenAIKey.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce(STANDBY)
    const call = vi.fn(async (client: { label: string }) => {
      if (client.label === "ativa") throw rejected
      return { usage }
    })
    await trackedCompletion(CONTEXT, "gpt-6-luna", call as never)
    expect(call).toHaveBeenCalledTimes(2)
    expect(mocks.reportRejectedOpenAIKey).toHaveBeenCalledWith(ACTIVE, expect.stringContaining("Incorrect API key"))
    expect(mocks.resolveOpenAIKey).toHaveBeenLastCalledWith({ fresh: true })
    expect(mocks.inserted.map((row) => [row.ai_key_id, row.success])).toEqual([
      ["key-ativa", false],
      ["key-reserva", true],
    ])
    expect(String(mocks.inserted[0].error)).not.toContain("****abcd")
  })

  it("sem reserva, cai na variável de ambiente", async () => {
    mocks.resolveOpenAIKey.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce(ENV)
    const call = vi.fn(async (client: { label: string }) => {
      if (client.label === "ativa") throw rejected
      return { usage }
    })
    await trackedCompletion(CONTEXT, "gpt-6-luna", call as never)
    expect(mocks.inserted.at(-1)).toMatchObject({ success: true, ai_key_id: null, key_source: "env" })
  })

  it("se a troca foi travada (mesma chave continua em uso), devolve o erro sem repetir", async () => {
    mocks.resolveOpenAIKey.mockResolvedValue(ACTIVE)
    const call = vi.fn(async () => {
      throw rejected
    })
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", call as never)).rejects.toBe(rejected)
    expect(call).toHaveBeenCalledTimes(1)
    expect(mocks.reportRejectedOpenAIKey).toHaveBeenCalledTimes(1)
  })

  it("repete no máximo uma vez, mesmo se a reserva também for recusada", async () => {
    mocks.resolveOpenAIKey.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce(STANDBY)
    const call = vi.fn(async () => {
      throw rejected
    })
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", call as never)).rejects.toBe(rejected)
    expect(call).toHaveBeenCalledTimes(2)
    expect(mocks.reportRejectedOpenAIKey).toHaveBeenCalledTimes(1)
  })

  it("outros erros (429, 500) e recusa da variável de ambiente não trocam nada", async () => {
    mocks.resolveOpenAIKey.mockResolvedValue(ACTIVE)
    const limited = Object.assign(new Error("Rate limit"), { status: 429 })
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", (async () => {
      throw limited
    }) as never)).rejects.toBe(limited)
    mocks.resolveOpenAIKey.mockResolvedValue(ENV)
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", (async () => {
      throw rejected
    }) as never)).rejects.toBe(rejected)
    expect(mocks.reportRejectedOpenAIKey).not.toHaveBeenCalled()
  })

  it("pausa geral: nenhuma chamada sai", async () => {
    mocks.state.paused = true
    const call = vi.fn()
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", call as never)).rejects.toBeInstanceOf(PlatformAiPausedError)
    expect(call).not.toHaveBeenCalled()
    expect(mocks.resolveOpenAIKey).not.toHaveBeenCalled()
  })

  it("sem chave nenhuma: registra a falha e devolve o erro", async () => {
    mocks.resolveOpenAIKey.mockRejectedValue(new Error("Nenhuma chave da OpenAI configurada"))
    await expect(trackedCompletion(CONTEXT, "gpt-6-luna", vi.fn() as never)).rejects.toThrow("Nenhuma chave")
    expect(mocks.inserted[0]).toMatchObject({ success: false, key_source: null })
  })

  it("testes com a IA real (sem contexto) usam só a variável de ambiente, sem banco", async () => {
    mocks.envOpenAIKey.mockReturnValue(ENV)
    const call = vi.fn(async (client: { label: string }) => ({ client, usage }))
    await trackedCompletion(null, "gpt-6-luna", call as never)
    expect(call.mock.calls[0][0].label).toBe("OPENAI_API_KEY")
    expect(mocks.resolveOpenAIKey).not.toHaveBeenCalled()
    expect(mocks.inserted).toHaveLength(0)
  })
})
