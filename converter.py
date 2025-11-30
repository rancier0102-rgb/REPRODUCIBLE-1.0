import os
from datetime import datetime

print("Iniciando...")

os.makedirs('output', exist_ok=True)

with open('channels.txt', 'r') as f:
    lines = f.readlines()

with open('output/playlist.m3u', 'w') as f:
    f.write('#EXTM3U\n')
    f.write(f'# Generado: {datetime.now()}\n\n')
    
    for line in lines:
        line = line.strip()
        if line and ',' in line:
            parts = line.split(',', 1)
            name = parts[0]
            url = parts[1]
            f.write(f'#EXTINF:-1,{name}\n')
            f.write(f'{url}\n')
            print(f'+ {name}')

print("Completado!")
