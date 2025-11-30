import json
import os
from datetime import datetime

def main():
    print("=" * 50)
    print("JSON TO M3U CONVERTER")
    print("=" * 50)
    
    # Leer configuracion
    with open('config.json', 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    channels = config.get('channels', [])
    output = config.get('output', 'output/playlist.m3u')
    
    print(f"Canales encontrados: {len(channels)}")
    
    # Crear carpeta output
    os.makedirs('output', exist_ok=True)
    
    # Generar M3U
    with open(output, 'w', encoding='utf-8') as f:
        f.write('#EXTM3U\n')
        f.write(f'# Generado: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
        f.write(f'# Total: {len(channels)} canales\n\n')
        
        for ch in channels:
            title = ch.get('title', 'Sin nombre')
            logo = ch.get('logo', '')
            url = ch.get('url', '')
            group = ch.get('group', 'General')
            
            if url:
                line = '#EXTINF:-1'
                if logo:
                    line += f' tvg-logo="{logo}"'
                line += f' group-title="{group}"'
                line += f',{title}'
                
                f.write(line + '\n')
                f.write(url + '\n')
                print(f"  + {title}")
    
    print(f"\n✅ Archivo generado: {output}")
    print(f"   Total canales: {len(channels)}")

if __name__ == '__main__':
    main()
