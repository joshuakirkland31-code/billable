"""Writes icons/icon-{180,192,512}.png with only the standard library (no PIL).

Dark #0b0f17 square with a gold "$" drawn from a small bitmap, plus a thin gold underline.
"""
import os
import struct
import zlib

BG = (0x0B, 0x0F, 0x17)
GOLD = (0xF5, 0xC4, 0x51)
GLYPH = [  # 7 x 11 "$"
    "...#...",
    ".#####.",
    "##.#.##",
    "##.#...",
    ".####..",
    "..####.",
    "...#.##",
    "##.#.##",
    ".#####.",
    "...#...",
    ".......",
]


def png(path, size):
    gw, gh = len(GLYPH[0]), len(GLYPH)
    cell = size * 0.62 / gh
    ox = (size - gw * cell) / 2
    oy = (size - gh * cell) / 2 + size * 0.03
    line_y0, line_y1 = int(size * 0.80), int(size * 0.815)
    line_x0, line_x1 = int(size * 0.30), int(size * 0.70)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            gx, gy = int((x - ox) // cell), int((y - oy) // cell)
            on = 0 <= gx < gw and 0 <= gy < gh and GLYPH[gy][gx] == "#"
            on = on or (line_y0 <= y <= line_y1 and line_x0 <= x <= line_x1)
            row += bytes(GOLD if on else BG)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out, exist_ok=True)
    for s in (180, 192, 512):
        png(os.path.join(out, f"icon-{s}.png"), s)
        print("wrote", f"icons/icon-{s}.png")
