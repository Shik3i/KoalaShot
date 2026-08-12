#!/usr/bin/env python3
"""Generate the small repository-owned KoalaShot PNG icons without dependencies."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "extension" / "icons"


def inside_round_rect(x: float, y: float, left: float, top: float, right: float, bottom: float, radius: float) -> bool:
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def circle(x: float, y: float, cx: float, cy: float, radius: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def render(size: int) -> bytes:
    pixels = bytearray()
    scale = size / 128
    for py in range(size):
        pixels.append(0)
        for px in range(size):
            x = (px + 0.5) / scale
            y = (py + 0.5) / scale
            color = (0, 0, 0, 0)
            if inside_round_rect(x, y, 0, 0, 128, 128, 30):
                color = (40, 122, 74, 255)
            if inside_round_rect(x, y, 22, 31, 106, 97, 16):
                color = (239, 248, 239, 255)
            if circle(x, y, 64, 64, 24):
                color = (159, 197, 167, 255)
            if circle(x, y, 44, 45, 13) or circle(x, y, 84, 45, 13):
                color = (115, 157, 125, 255)
            if circle(x, y, 54, 61, 4) or circle(x, y, 74, 61, 4) or circle(x, y, 64, 72, 9):
                color = (24, 48, 31, 255)
            if circle(x, y, 96, 42, 5):
                color = (98, 199, 132, 255)
            pixels.extend(color)
    raw = bytes(pixels)
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    chunks = [chunk(b"IHDR", header), chunk(b"IDAT", zlib.compress(raw, 9)), chunk(b"IEND", b"")]
    return b"\x89PNG\r\n\x1a\n" + b"".join(chunks)


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 96, 128):
        (OUTPUT / f"icon-{size}.png").write_bytes(render(size))


if __name__ == "__main__":
    main()
