import math
import wave
import struct
import os

sample_rate = 44100
duration = 4.0

filepath = '/home/premdroid/.gemini/antigravity-ide/scratch/whatsapp-clone/public/ringtone.wav'
os.makedirs(os.path.dirname(filepath), exist_ok=True)
wave_file = wave.open(filepath, 'w')
wave_file.setnchannels(1)
wave_file.setsampwidth(2)
wave_file.setframerate(sample_rate)

for i in range(int(sample_rate * duration)):
    t = float(i) / sample_rate
    on = False
    t_mod = t % 4.0
    if t_mod < 0.4:
        on = True
    elif 0.6 < t_mod < 1.0:
        on = True
        
    value = 0
    if on:
        value = math.sin(2.0 * math.pi * 440.0 * t) + math.sin(2.0 * math.pi * 480.0 * t)
        value = value * 0.5 * 20000
    
    data = struct.pack('<h', int(value))
    wave_file.writeframesraw(data)

wave_file.close()
print("Ringtone generated at", filepath)
