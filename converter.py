import os
from datetime import datetime

print("Iniciando...")

os.makedirs('output', exist_ok=True)

with open('channels.txt', 'r') as f:
    lines = f.readlines()

def crear_playlist(filename, extension):
    with open(f'output/{filename}', 'w') as f:
        f.write('#EXTM3U x-tvg-url=""\n\n')
        
        for line in lines:
            line = line.strip()
            if line and ',' in line:
                parts = line.split(',', 1)
                name = parts[0]
                url = parts[1]
                
                url_parts = url.replace('http://', '').split('/')
                if len(url_parts) >= 4:
                    host = url_parts[0]
                    user = url_parts[1]
                    password = url_parts[2]
                    stream_id = url_parts[3]
                    
                    stream_url = f'http://{host}/live/{user}/{password}/{stream_id}{extension}'
                    
                    f.write(f'#EXTINF:-1 tvg-id="{stream_id}" tvg-name="{name}" tvg-logo="" group-title="TV",{name}\n')
                    f.write(f'{stream_url}\n')
    
    print(f'Creado: {filename}')

# Crear ambas versiones
crear_playlist('playlist.m3u', '.ts')
crear_playlist('playlist_hls.m3u', '.m3u8')

print("\n✅ Completado!")
