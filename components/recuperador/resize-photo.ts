import { PHOTO_QUALITY, fitWithin, photoName } from "@/lib/recovery/images"

/**
 * Reduz uma foto no navegador (JPG, até 1.600 px no maior lado, respeitando a orientação da câmera). Foto que o navegador
 * não consegue ler (ex.: HEIC no Chrome) lança erro para a tela pedir JPG/PNG.
 */
export async function resizePhoto(file: File, index: number): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    const size = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Sem canvas")
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY))
    if (!blob) throw new Error("Falha ao gerar o JPG")
    return new File([blob], photoName(file.name, index), { type: "image/jpeg" })
  } finally {
    bitmap.close()
  }
}
