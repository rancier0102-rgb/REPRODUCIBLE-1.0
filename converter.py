import json
import os
from datetime import datetime

print("Iniciando...")

# Crear carpeta
if not os.path.exists('output'):
    os.makedirs('output')
    print("Carpeta output creada")

# Leer config
print("Leyendo config.json...")
f = open('config.json', 'r')
data = f.read()
f.close()
print("Config leido")

config = json.loads(data)
channels = config.get('channels', [])
print(f"Canales: {len(channels)}")

# Escribir M3U
output_file = 'output/playlist.m3u'
print(f"Escribiendo: {output_file}")

f = open(output_file, 'w')
f.write('#EXTM3U\n')
f.write(f'# Generado: {datetime.now()}\n')
f.write(f'# Total: {len(channels)} canales\n\n')

for ch in channels:
    title = ch.get('title', 'Sin nombre')
    logo = ch.get('logo', '')
    url = ch.get('url', '')
    
    line = '#EXTINF:-1'
    if logo:
        line = line + f' tvg-logo="{logo}"'
    line = line + f',{title}\n'
    
    f.write(line)
    f.write(url + '\n')
    print(f"Agregado: {title}")

f.close()

print("Completado!")
