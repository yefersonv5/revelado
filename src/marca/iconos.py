"""Genera los íconos PNG de la raíz a partir del mismo trazo de logo.svg: python3 src/marca/iconos.py

Dibuja con Pillow (no hace falta convertir SVG): degradado azul de marca, un anillo
blanco y la mitad derecha llena, como un círculo de tono a medio revelar.
"""
import os
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
A, B = (0x2E, 0x7B, 0xFF), (0x15, 0x46, 0xB8)


def icono(lado, margen=1.0):
    """margen < 1 encoge el dibujo para la versión 'maskable' (zona segura)."""
    s = lado * 4  # se dibuja grande y se reduce para suavizar bordes
    im = Image.new('RGB', (s, s))
    px = im.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            px[x, y] = tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3))
    d = ImageDraw.Draw(im)
    c, r, w = s / 2, s * 150 / 512 * margen, s * 28 / 512 * margen
    d.ellipse([c - r, c - r, c + r, c + r], outline='white', width=round(w))
    ri = r - w / 2
    d.pieslice([c - ri, c - ri, c + ri, c + ri], -90, 90, fill='white')
    return im.resize((lado, lado), Image.LANCZOS)


icono(192).save(os.path.join(root, 'icon-192.png'))
icono(512).save(os.path.join(root, 'icon-512.png'))
icono(512, 0.78).save(os.path.join(root, 'icon-maskable.png'))
icono(180).save(os.path.join(root, 'apple-touch-icon.png'))
print('íconos listos')
