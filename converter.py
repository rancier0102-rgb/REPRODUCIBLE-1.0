import os
from datetime import datetime

print("Iniciando...")

os.makedirs('output', exist_ok=True)

with open('channels.txt', 'r') as f:
    lines = f.readlines()

# Version 1: .ts (más común)
with open('output/playlist_ts.m3u', 'w') as f:
    f.write('#EXTM3U\n')
    for line in lines:
        line = line.strip()
        if line and ',' in line:
            parts = line.split(',', 1)
            name = parts[0]
            url = parts[1]
            f.write(f'#EXTINF:-1,{name}\n')
            f.write(f'{url}.ts\n')
print("Creado: playlist_ts.m3u")

# Version 2: .m3u8
with open('output/playlist_m3u8.m3u', 'w') as f:
    f.write('#EXTM3U\n')
    for line in lines:
        line = line.strip()
        if line and ',' in line:
            parts = line.split(',', 1)
            name = parts[0]
            url = parts[1]
            f.write(f'#EXTINF:-1,{name}\n')
            f.write(f'{url}.m3u8\n')
print("Creado: playlist_m3u8.m3u")

# Version 3: Sin extension
with open('output/playlist_raw.m3u', 'w') as f:
    f.write('#EXTM3U\n')
    for line in lines:
        line = line.strip()
        if line and ',' in line:
            parts = line.split(',', 1)
            name = parts[0]
            url = parts[1]
            f.write(f'#EXTINF:-1,{name}\n')
            f.write(f'{url}\n')
print("Creado: playlist_raw.m3u")

# Version 4: Formato /live/ con .ts
with open('output/playlist_live.m3u', 'w') as f:
    f.write('#EXTM3U\n')
    for line in lines:
        line = line.strip()
        if line and ',' in line:
            parts = line.split(',', 1)
            name = parts[0]
            url = parts[1]
            # Convertir formato
            # De: http://host:port/user/pass/id
            # A:  http://host:port/live/user/pass/id.ts
            url_parts = url.replace('http://', '').split('/')
            if len(url_parts) >= 4:
                host = url_parts[0]
                user = url_parts[1]
                password = url_parts[2]
                stream_id = url_parts[3]
                new_url = f'http://{host}/live/{user}/{password}/{stream_id}.ts'
                f.write(f'#EXTINF:-1,{name}\n')
                f.write(f'{new_url}\n')
print("Creado: playlist_live.m3u")

print("\n✅ Completado! Prueba cada archivo.")
