#!/usr/bin/env python3
"""Generate local SVG flag assets for almanac countries without network access.

Existing SVGs are kept by default. Missing flags are rendered from the local
Apple Color Emoji font into a small PNG and wrapped in an SVG file so browsers
do not need regional-indicator emoji support at runtime.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "almanac.mock.json"
EMOJI_DIR = ROOT / "emoji"
MIRROR_DIR = EMOJI_DIR / "svg"
FONT_PATH = Path("/System/Library/Fonts/Apple Color Emoji.ttc")
RENDER_SIZE = 160
CANVAS_SIZE = 192

# Kosovo is not an ISO 3166-1 alpha-2 country code, but the app data and emoji
# convention use the XK regional-indicator pair.
ASSET_OVERRIDES = {
    "XK": "1f1fd-1f1f0.svg",
}


def flag_asset_name(iso: str) -> str:
    iso = iso.upper()
    if iso in ASSET_OVERRIDES:
        return ASSET_OVERRIDES[iso]
    if len(iso) != 2 or not iso.isalpha():
        raise ValueError(f"Unsupported ISO code: {iso}")
    return "-".join(f"{0x1F1E6 + ord(ch) - ord('A'):x}" for ch in iso) + ".svg"


def flag_from_iso(iso: str) -> str:
    iso = iso.upper()
    return "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in iso)


def render_flag_png(flag: str, font: ImageFont.FreeTypeFont) -> bytes:
    image = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    bbox = draw.textbbox((0, 0), flag, font=font, embedded_color=True)
    x = (CANVAS_SIZE - (bbox[2] - bbox[0])) // 2 - bbox[0]
    y = (CANVAS_SIZE - (bbox[3] - bbox[1])) // 2 - bbox[1]
    draw.text((x, y), flag, font=font, embedded_color=True)

    alpha_bbox = image.getbbox()
    if alpha_bbox:
        image = image.crop(alpha_bbox)

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def svg_for_png(png_bytes: bytes, label: str) -> str:
    encoded = base64.b64encode(png_bytes).decode("ascii")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" '
        'role="img" aria-label="'
        + label.replace("&", "&amp;").replace('"', "&quot;")
        + ' flag">'
        '<image href="data:image/png;base64,'
        + encoded
        + '" x="0" y="0" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>'
        "</svg>\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate existing root emoji SVGs as well as missing files.",
    )
    args = parser.parse_args()

    if not FONT_PATH.exists():
        raise SystemExit(f"Missing local emoji font: {FONT_PATH}")

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    EMOJI_DIR.mkdir(exist_ok=True)
    MIRROR_DIR.mkdir(exist_ok=True)
    font = ImageFont.truetype(str(FONT_PATH), RENDER_SIZE)

    created = 0
    mirrored = 0
    skipped = 0

    for iso, entry in data.items():
        asset_name = flag_asset_name(iso)
        root_asset = EMOJI_DIR / asset_name
        mirror_asset = MIRROR_DIR / asset_name

        if root_asset.exists() and not args.overwrite:
            skipped += 1
        else:
            label = entry.get("name_en") or iso
            svg = svg_for_png(render_flag_png(flag_from_iso(iso), font), label)
            root_asset.write_text(svg, encoding="utf-8")
            created += 1

        root_bytes = root_asset.read_bytes()
        if not mirror_asset.exists() or mirror_asset.read_bytes() != root_bytes:
            mirror_asset.write_bytes(root_bytes)
            mirrored += 1

    print(f"created={created} skipped={skipped} mirrored={mirrored} countries={len(data)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
