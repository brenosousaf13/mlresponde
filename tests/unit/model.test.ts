import { describe, expect, it } from "vitest"

import { DEFAULT_ANSWER_MODEL, answerModelOptions, isLegacyChatModel } from "@/lib/answers/model"

describe("modelo da IA", () => {
  it("usa o GPT-6 Luna por padrão", () => {
    expect(DEFAULT_ANSWER_MODEL).toBe("gpt-6-luna")
  })

  it("GPT-6 Luna roda sem raciocínio, com temperature e max_completion_tokens", () => {
    expect(answerModelOptions("gpt-6-luna")).toEqual({
      temperature: 0.2,
      max_completion_tokens: 700,
      reasoning_effort: "none",
    })
  })

  it("modelos antigos não recebem reasoning_effort (volta pela variável OPENAI_MODEL)", () => {
    expect(isLegacyChatModel("gpt-4o-mini")).toBe(true)
    expect(isLegacyChatModel(" GPT-4.1-mini ")).toBe(true)
    expect(isLegacyChatModel("gpt-6-luna")).toBe(false)
    expect(answerModelOptions("gpt-4o-mini")).not.toHaveProperty("reasoning_effort")
  })
})
