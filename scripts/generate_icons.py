#!/usr/bin/env python3
"""Generate deterministic KoalaShot PNG icons from the repository-owned master."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "extension" / "icons"
MASTER = OUTPUT / "icon-master.png"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunk(kind: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def read_rgba_png(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"not a PNG: {path}")

    offset = len(PNG_SIGNATURE)
    compressed = bytearray()
    width = height = 0
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (bit_depth, color_type, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("icon master must be a non-interlaced 8-bit RGBA PNG")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break

    stride = width * 4
    encoded = zlib.decompress(bytes(compressed))
    expected = height * (stride + 1)
    if width <= 0 or height <= 0 or len(encoded) != expected:
        raise ValueError("invalid icon master dimensions or pixel payload")

    pixels = bytearray(width * height * 4)
    previous = bytearray(stride)
    source_offset = 0
    for row_index in range(height):
        filter_type = encoded[source_offset]
        source_offset += 1
        scanline = encoded[source_offset : source_offset + stride]
        source_offset += stride
        reconstructed = bytearray(stride)
        for index, value in enumerate(scanline):
            left = reconstructed[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = paeth(left, above, upper_left)
            else:
                raise ValueError(f"unsupported PNG filter type: {filter_type}")
            reconstructed[index] = (value + predictor) & 0xFF
        start = row_index * stride
        pixels[start : start + stride] = reconstructed
        previous = reconstructed
    return width, height, bytes(pixels)


def source_pixel(pixels: bytes, width: int, x: int, y: int) -> tuple[int, int, int, int]:
    offset = (y * width + x) * 4
    return tuple(pixels[offset : offset + 4])  # type: ignore[return-value]


def resize_rgba(pixels: bytes, width: int, height: int, size: int) -> bytes:
    output = bytearray(size * size * 4)
    content_size = max(1, round(size * 0.75))
    padding = (size - content_size) // 2
    samples = 4
    for target_y in range(content_size):
        for target_x in range(content_size):
            alpha_sum = 0.0
            premultiplied = [0.0, 0.0, 0.0]
            for sample_y in range(samples):
                source_y = (target_y + (sample_y + 0.5) / samples) * height / content_size - 0.5
                y0 = max(0, min(height - 1, math.floor(source_y)))
                y1 = min(height - 1, y0 + 1)
                fraction_y = max(0.0, min(1.0, source_y - y0))
                for sample_x in range(samples):
                    source_x = (target_x + (sample_x + 0.5) / samples) * width / content_size - 0.5
                    x0 = max(0, min(width - 1, math.floor(source_x)))
                    x1 = min(width - 1, x0 + 1)
                    fraction_x = max(0.0, min(1.0, source_x - x0))
                    neighbors = (
                        (source_pixel(pixels, width, x0, y0), (1 - fraction_x) * (1 - fraction_y)),
                        (source_pixel(pixels, width, x1, y0), fraction_x * (1 - fraction_y)),
                        (source_pixel(pixels, width, x0, y1), (1 - fraction_x) * fraction_y),
                        (source_pixel(pixels, width, x1, y1), fraction_x * fraction_y),
                    )
                    for (red, green, blue, alpha), weight in neighbors:
                        weighted_alpha = alpha * weight
                        alpha_sum += weighted_alpha
                        premultiplied[0] += red * weighted_alpha
                        premultiplied[1] += green * weighted_alpha
                        premultiplied[2] += blue * weighted_alpha

            sample_count = samples * samples
            alpha = round(alpha_sum / sample_count)
            if alpha_sum:
                color = tuple(round(channel / alpha_sum) for channel in premultiplied) + (alpha,)
            else:
                color = (0, 0, 0, 0)
            offset = ((target_y + padding) * size + target_x + padding) * 4
            output[offset : offset + 4] = bytes(color)
    return bytes(output)


def write_rgba_png(path: Path, size: int, pixels: bytes) -> None:
    rows = bytearray()
    stride = size * 4
    for row_index in range(size):
        rows.append(0)
        start = row_index * stride
        rows.extend(pixels[start : start + stride])
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    contents = PNG_SIGNATURE + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
    path.write_bytes(contents)


def main() -> None:
    width, height, pixels = read_rgba_png(MASTER)
    if width != height or width < 512:
        raise SystemExit("icon-master.png must be a square RGBA PNG of at least 512px")
    for size in (16, 32, 48, 96, 128):
        write_rgba_png(OUTPUT / f"icon-{size}.png", size, resize_rgba(pixels, width, height, size))


if __name__ == "__main__":
    main()
