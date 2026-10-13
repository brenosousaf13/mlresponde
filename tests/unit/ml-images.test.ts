import { describe, expect, it } from "vitest"

import { mlImageUrl } from "@/lib/mercadolivre/images"

describe("mlImageUrl", () => {
  it("troca http por https nas fotos do ML (o ML ainda devolve thumbnail com http)", () => {
    expect(mlImageUrl("http://http2.mlstatic.com/D_773095-MLB116492909103_082026-I.webp")).toBe(
      "https://http2.mlstatic.com/D_773095-MLB116492909103_082026-I.webp"
    )
  })

  it("mantém o endereço https e aceita subdomínios do mlstatic", () => {
    expect(mlImageUrl("https://http2.mlstatic.com/D_1-I.jpg")).toBe("https://http2.mlstatic.com/D_1-I.jpg")
    expect(mlImageUrl(" https://mlstatic.com/x.jpg ")).toBe("https://mlstatic.com/x.jpg")
  })

  it("aceita endereço sem protocolo (//)", () => {
    expect(mlImageUrl("//http2.mlstatic.com/D_1-I.jpg")).toBe("https://http2.mlstatic.com/D_1-I.jpg")
  })

  it.each([null, undefined, "", "   ", "não é url", "ftp://http2.mlstatic.com/x.jpg", "https://exemplo.com/x.jpg", "https://mlstatic.com.evil.io/x.jpg", "javascript:alert(1)"])(
    "recusa %s (vira o ícone de pacote, em vez de imagem quebrada)",
    (value) => {
      expect(mlImageUrl(value)).toBeNull()
    }
  )
})
