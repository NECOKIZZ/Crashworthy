#!/bin/bash
# Builds the demo video: frames (capture.mjs) + Piper narration + subtitles -> crashworthy-demo.mp4
# usage: video/build.sh <workdir> <piper-bin> <voice.onnx> <entire-shots-dir> <out.mp4>
set -euo pipefail
W=$1; PIPER=$2; VOICE=$3; SHOTS=$4; OUT=$5
mkdir -p "$W/frames" "$W/audio" "$W/clips"
node video/capture.mjs "$W/frames" "$SHOTS"
: > "$W/list.txt"; : > "$W/subs.srt"
t=0; n=0
ts() { python3 -c "import sys;t=float(sys.argv[1]);h=int(t//3600);m=int(t%3600//60);s=t%60;print('%02d:%02d:%06.3f'%(h,m,s)).replace('.',',')" "$1"; }
for id in $(python3 -c "import json;print(' '.join(s['id'] for s in json.load(open('video/scenes.json'))))"); do
  say=$(python3 -c "import json,sys;print(next(s['say'] for s in json.load(open('video/scenes.json')) if s['id']==sys.argv[1]))" "$id")
  echo "$say" | "$PIPER" -m "$VOICE" --length_scale 1.0 --sentence_silence 0.25 -f "$W/audio/$id.wav" >/dev/null 2>&1
  a=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/audio/$id.wav")
  d=$(python3 -c "print(round($a+1.0,2))"); frames=$(python3 -c "print(int($d*30))")
  ffmpeg -v error -y -loop 1 -i "$W/frames/$id.png" -i "$W/audio/$id.wav" \
    -filter_complex "[0:v]scale=1920:1080,zoompan=z='1+0.03*on/$frames':x='iw/2-(iw/zoom/2)':y='0':d=$frames:s=1920x1080:fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st=$(python3 -c "print($d-0.4)"):d=0.4,format=yuv420p[v];[1:a]adelay=400|400,apad[a]" \
    -map "[v]" -map "[a]" -t "$d" -c:v libx264 -preset medium -crf 20 -c:a aac -ar 48000 -ac 2 "$W/clips/$id.mp4"
  echo "file '$W/clips/$id.mp4'" >> "$W/list.txt"
  # one subtitle cue per sentence, timed by character share
  python3 - "$say" "$t" "$a" "$n" >> "$W/subs.srt" <<'PY'
import re,sys
say,t0,dur,n=sys.argv[1],float(sys.argv[2])+0.4,float(sys.argv[3]),int(sys.argv[4])
say=say.replace("cfo dot ai","cfo.ai")
parts=[p.strip() for p in re.split(r'(?<=[.:?])\s+',say) if p.strip()]
tot=sum(len(p) for p in parts); t=t0
f=lambda x:'%02d:%02d:%06.3f'%(x//3600,x%3600//60,x%60)
for i,p in enumerate(parts):
  d=dur*len(p)/tot; n+=1
  print(f"{n}\n{f(t).replace('.',',')} --> {f(t+d).replace('.',',')}\n{p}\n"); t+=d
PY
  n=$(grep -c -- "-->" "$W/subs.srt"); t=$(python3 -c "print($t+$d)")
done
ffmpeg -v error -y -f concat -safe 0 -i "$W/list.txt" -c copy "$W/joined.mp4"
ffmpeg -v error -y -i "$W/joined.mp4" -vf "subtitles=$W/subs.srt:force_style='FontName=DejaVu Sans,FontSize=11,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=14'" -c:v libx264 -preset medium -crf 20 -c:a copy "$OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
