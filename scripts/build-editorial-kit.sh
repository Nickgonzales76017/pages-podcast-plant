#!/usr/bin/env bash
# Bounded, permission-checked real-audio fixture for the Creator Studio.
# Production app does NOT need this build script: it loads the pinned outputs.
set -euo pipefail
cd "$(dirname "$0")/.."
dest="$PWD/site/studio/media"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$dest"

grab() {
  local url="$1" file="$2"
  printf 'Fetching reviewed source: %s\n' "$file"
  curl --fail --location --silent --show-error --retry 4 \
    --retry-all-errors --retry-delay 3 --connect-timeout 20 \
    --max-time 160 --max-filesize 20000000 \
    --proto '=https' --proto-redir '=https' "$url" --output "$tmp/$file"
  test -s "$tmp/$file" || { echo "Empty permitted source: $file" >&2; exit 1; }
}
encode() {
  local name="$1" from="$2" seconds="$3" out="$4"
  ffmpeg -hide_banner -nostdin -loglevel error -y \
    -ss "$from" -i "$tmp/$name" -t "$seconds" \
    -ac 2 -ar 48000 -c:a libmp3lame -b:a 96k \
    -map_metadata -1 -write_xing 1 "$dest/$out"
  test -s "$dest/$out"
  local actual; actual="$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$dest/$out")"
  awk -v d="$actual" -v t="$seconds" 'BEGIN { if(d<t-0.2 || d>t+0.3) exit 1; }' || {
    echo "Wrong duration for $out ($actual)" >&2
    exit 1
  }
}

# Real, independently licensed recordings, exact source owner URLs only.
grab 'https://archive.org/download/spc266_2508_librivox/spc266_afterlove_pac_128kb.mp3' voice-original.mp3
grab 'https://raw.githubusercontent.com/uncle-sheepsky/duru-cc0-bgm/master/mp3/duru-roomscene-lofi.mp3' music-original.mp3
grab 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Restaurant_ambience.ogg' cafe-original.ogg
grab 'https://upload.wikimedia.org/wikipedia/commons/2/27/Typing_on_Keychron_V1_Ultra_%28Red_Linear_Switch%29.wav' typing-original.wav

encode voice-original.mp3 17.55 11.5 voice-reading.mp3
encode music-original.mp3 0 18 music-bed.mp3
encode cafe-original.ogg 4 16 location-ambience.mp3
encode typing-original.wav 0 6 keyboard-foley.mp3

( cd "$dest" && sha256sum voice-reading.mp3 music-bed.mp3 location-ambience.mp3 keyboard-foley.mp3 > SHA256SUMS )
for file in "$dest"/*.mp3; do
  bytes="$(wc -c < "$file")"
  [ "$bytes" -le 500000 ] || { echo "Media excerpt exceeded 500KB: $file" >&2; exit 1; }
done
printf 'Verified real audio pack:\n'
cat "$dest/SHA256SUMS"
