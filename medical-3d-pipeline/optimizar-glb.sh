#!/usr/bin/env bash
set -u

INPUT="${1:-}"

if [ -z "$INPUT" ]; then
  echo "Uso: ./optimizar-glb.sh medical-3d-pipeline/input/modelo.gltf"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "No existe el archivo: $INPUT"
  echo "Subi tu modelo como: medical-3d-pipeline/input/modelo.gltf o modelo.glb"
  exit 1
fi

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="$BASE_DIR/output"
mkdir -p "$OUTDIR"

BASENAME="$(basename "$INPUT")"
NAME="${BASENAME%.*}"

OPT="$OUTDIR/${NAME}_opt.glb"
FINAL="$OUTDIR/${NAME}_final.glb"

EXPECTED="$OUTDIR/modelo_final.glb"

echo "Archivo de entrada: $INPUT"
echo "Salida final: $FINAL"

echo "1/2 Convirtiendo/optimizando con glTF-Transform..."
gltf-transform optimize "$INPUT" "$OPT" \
  --dedupe \
  --meshopt \
  --quantize POSITION=16 NORMAL=12 TEXCOORD=12 COLOR=8

if [ $? -ne 0 ]; then
  echo "glTF-Transform fallo. Copiando entrada como fallback."
  cp "$INPUT" "$FINAL"
  cp "$FINAL" "$EXPECTED"
  exit 0
fi

echo "2/2 Comprimiendo con gltfpack..."
gltfpack \
  -i "$OPT" \
  -o "$FINAL" \
  -cc \
  -tc \
  -kn \
  -km

if [ $? -ne 0 ]; then
  echo "gltfpack fallo. Usando archivo optimizado por glTF-Transform como resultado final."
  cp "$OPT" "$FINAL"
fi

cp "$FINAL" "$EXPECTED"

echo "Listo"
ls -lh "$INPUT" "$FINAL" "$EXPECTED"
