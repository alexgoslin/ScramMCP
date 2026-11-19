# Makes the app icons from the Scram logo (installer/build/scram-logo.png: the green logo on a
# transparent background, with white insides). electron-builder turns them into the Windows .ico
# and the Mac .icns. Run from the repo root: python3 installer/make-icons.py (needs Pillow).
#   icon.png      the logo as it is (Windows, Linux)
#   icon-mac.png  the logo on a white rounded tile, the usual Mac icon shape (newer macOS puts
#                 icons that aren't that shape inside a grey tile)

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

build = Path(__file__).parent / "build"
logo = Image.open(build / "scram-logo.png").convert("RGBA")
SIZE = 1024


def fit(img, box):
    scale = min(box / img.width, box / img.height)
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def centred(canvas, img):
    canvas.alpha_composite(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))


plain = Image.new("RGBA", (SIZE, SIZE))
centred(plain, fit(logo, 940))
plain.save(build / "icon.png")

# Apple's icon grid: an 824×824 rounded square in a 1024 canvas, with a soft shadow.
tile = Image.new("RGBA", (SIZE, SIZE))
shadow = Image.new("RGBA", (SIZE, SIZE))
ImageDraw.Draw(shadow).rounded_rectangle((100, 112, 924, 936), radius=185, fill=(0, 0, 0, 70))
tile.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
ImageDraw.Draw(tile).rounded_rectangle((100, 100, 924, 924), radius=185, fill=(255, 255, 255, 255))
centred(tile, fit(logo, 640))
tile.save(build / "icon-mac.png")
print("Wrote", build / "icon.png", "and", build / "icon-mac.png")
