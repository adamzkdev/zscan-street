#!/bin/sh
# scripts/tex-compress.sh: public/tex/*/*.jpg → WebP for the web (colour q80, normal q88, roughness/ao grey q72 at half
# size; facades and walls capped at 1024, the ground at 2048), the metalness maps dropped (the materials set it), JPEGs removed.
set -e
cd "$(dirname "$0")/../public/tex"
for d in */; do
  d=${d%/}
  case "$d" in Asphalt*|PavingStones1[13]*|Grass*|Concrete031) MAX=2048 ;; *) MAX=1024 ;; esac
  for f in "$d"/*.jpg "$d"/*.png; do
    [ -e "$f" ] || continue
    b=$(basename "$f"); b=${b%.*}
    case "$b" in
      color) magick "$f" -resize "${MAX}x${MAX}>" -quality 80 "$d/color.webp" ;;
      normal) magick "$f" -resize "${MAX}x${MAX}>" -quality 88 "$d/normal.webp" ;;
      rough|ao) H=$((MAX / 2)); magick "$f" -colorspace Gray -resize "${H}x${H}>" -quality 72 "$d/$b.webp" ;;
      opacity) magick "$f" -colorspace Gray -resize "${MAX}x${MAX}>" -quality 85 "$d/opacity.webp" ;;
      metal) ;;
    esac
    rm "$f"
  done
done
