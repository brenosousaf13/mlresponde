"""Vetoriza a logo e o ícone originais da maanu (PNG) em curvas SVG.

Uso (na raiz do projeto, num ambiente Python com as dependências):
    python -m pip install potracer numpy pillow
    python docs/brand/scripts/vetorizar.py

Lê docs/brand/maanu-logo-original.png e docs/brand/maanu-icone-m-original.png e grava
docs/brand/scripts/vetores.json (caminho das letras + círculo do ponto, altura das letras = 100).
Depois rode `node docs/brand/scripts/gerar.mjs` para criar os arquivos finais.
"""

import json
import math
from pathlib import Path

import numpy as np
import potrace
from PIL import Image

HERE = Path(__file__).resolve().parent
BRAND = HERE.parent
SOURCES = {"wordmark": BRAND / "maanu-logo-original.png", "mark": BRAND / "maanu-icone-m-original.png"}


def masks(path: Path):
    src = Image.open(path).convert("RGBA")
    flat = Image.alpha_composite(Image.new("RGBA", src.size, (255, 255, 255, 255)), src).convert("RGB")
    im = np.asarray(flat).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    teal = (g - r > 60) & (b - r > 40)
    dark = (0.2126 * r + 0.7152 * g + 0.0722 * b < 110) & ~teal
    return dark, teal


def trace(mask, ox, oy, scale):
    # potracer preenche os pixels "escuros" (False); por isso a máscara vai invertida.
    curves = potrace.Bitmap(~mask).trace(
        turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.2
    )

    def pt(p):
        return f"{(p.x - ox) * scale:.2f} {(p.y - oy) * scale:.2f}".replace(".00", "")

    parts = []
    for curve in curves:
        parts.append("M" + pt(curve.start_point))
        for seg in curve.segments:
            parts.append(f"L{pt(seg.c)}L{pt(seg.end_point)}" if seg.is_corner else f"C{pt(seg.c1)} {pt(seg.c2)} {pt(seg.end_point)}")
        parts.append("Z")
    return "".join(parts)


def main():
    out = {}
    for name, path in SOURCES.items():
        dark, teal = masks(path)
        ys, xs = np.nonzero(dark | teal)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rows = np.nonzero(dark.any(axis=1))[0]
        scale = 100.0 / (rows.max() + 1 - rows.min())  # altura das letras = 100
        tys, txs = np.nonzero(teal)
        # O ponto vira um círculo perfeito (centro e raio pela área da mancha teal).
        dot = {
            "cx": round((txs.mean() - x0) * scale, 2),
            "cy": round((tys.mean() - y0) * scale, 2),
            "r": round(math.sqrt(teal.sum() / math.pi) * scale, 2),
        }
        out[name] = {
            "width": math.ceil(max((x1 - x0) * scale, dot["cx"] + dot["r"])),
            "height": math.ceil(max((y1 - y0) * scale, dot["cy"] + dot["r"])),
            "path": trace(dark, x0, y0, scale),
            "dot": dot,
        }
    (HERE / "vetores.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("ok:", {k: (v["width"], v["height"], len(v["path"])) for k, v in out.items()})


if __name__ == "__main__":
    main()
