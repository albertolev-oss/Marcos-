#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-}"

if [ -z "$INPUT" ]; then
  echo "Uso: ./optimizar-glb.sh medical-3d-pipeline/input/modelo.glb"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "No existe el archivo: $INPUT"
  echo "Subi tu modelo como: medical-3d-pipeline/input/modelo.glb"
  exit 1
fi

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="$BASE_DIR/output"
mkdir -p "$OUTDIR"

NAME="$(basename "$INPUT" .glb)"

OPT="$OUTDIR/${NAME}_opt.glb"
FINAL="$OUTDIR/${NAME}_final.glb"

echo "Archivo de entrada: $INPUT"
echo "Salida final: $FINAL"

echo "1/2 Optimizando con glTF-Transform..."
gltf-transform optimize "$INPUT" "$OPT" \
  --dedupe \
  --meshopt \
  --quantize POSITION=16 NORMAL=12 TEXCOORD=12 COLOR=8

echo "2/2 Comprimiendo con gltfpack..."
gltfpack \
  -i "$OPT" \
  -o "$FINAL" \
  -cc \
  -tc \
  -kn \
  -km

echo "Listo"
ls -lh "$INPUT" "$FINAL"
