# Generates a soft ambient pad (original, royalty-free) for the demo video.
# usage: python music.py <seconds> <out.wav>
import sys, numpy as np, soundfile as sf
dur, out = float(sys.argv[1]), sys.argv[2]
sr = 48000
t = np.arange(int(dur * sr)) / sr
# Cmaj7 - Am7 - Fmaj7 - G6, 8 s each, looped
chords = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 64]]
hz = lambda n: 440 * 2 ** ((n - 69) / 12)
seg = 8.0
mix = np.zeros_like(t)
for i in range(int(dur // seg) + 2):
    start = i * seg - 1.5                      # 1.5 s crossfade between chords
    notes = chords[i % 4]
    a = np.clip((t - start) / 2.5, 0, 1) * np.clip((start + seg + 3.0 - t) / 2.5, 0, 1)
    env = np.sin(a * np.pi / 2) ** 2
    if env.max() == 0:
        continue
    for k, n in enumerate(notes):
        f = hz(n)
        detune = 1 + 0.0015 * (k - 1.5)
        voice = (np.sin(2 * np.pi * f * detune * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t + k) + 0.08 * np.sin(2 * np.pi * 3 * f * t))
        mix += env * voice * (0.9 if k else 1.1)
# slow tremolo-free shimmer: a quiet high note every bar
for i in range(int(dur // 4)):
    s = i * 4.0 + 2.0
    n = chords[(i // 2) % 4][3] + 12
    e = np.clip((t - s) / 0.05, 0, 1) * np.exp(-np.clip(t - s, 0, None) / 1.8) * (t >= s)
    mix += 0.12 * e * np.sin(2 * np.pi * hz(n) * t)
# gentle low-pass (one-pole) and simple reverb (feedback delays)
y = np.zeros_like(mix); alpha = 0.08
for j in range(1, len(mix)):
    y[j] = y[j - 1] + alpha * (mix[j] - y[j - 1])
for d, g in [(0.113, 0.35), (0.197, 0.28), (0.311, 0.22)]:
    k = int(d * sr); y[k:] += g * y[:-k]
fade = np.minimum(1, np.minimum(t / 3.0, (dur - t) / 4.0)).clip(0, 1)
y *= fade
y /= np.abs(y).max() + 1e-9
sf.write(out, np.stack([y * 0.9, np.roll(y, int(0.012 * sr)) * 0.9], axis=1), sr)
