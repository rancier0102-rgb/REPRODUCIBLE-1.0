import requests
import json
import os
from datetime import datetime

class XtreamToM3U:
    def __init__(self, host, username, password):
        self.host = host.rstrip('/')
        self.username = username
        self.password = password
        self.channels = []
        
    def get_api_url(self, action=None):
        url = f"{self.host}/player_api.php?username={self.username}&password={self.password}"
        if action:
            url += f"&action={action}"
        return url
    
    def test_connection(self):
        try:
            print(f"Conectando a: {self.host}")
            response = requests.get(self.get_api_url(), timeout=30)
            print(f"Status code: {response.status_code}")
            data = response.json()
            
            if data.get('user_info'):
                print(f"Usuario: {data['user_info'].get('username')}")
                print(f"Estado: {data['user_info'].get('status')}")
                return True
            else:
                print(f"Respuesta: {data}")
                return False
        except Exception as e:
            print(f"Error conexion: {e}")
            return False
    
    def get_live_categories(self):
        try:
            url = self.get_api_url('get_live_categories')
            print(f"Obteniendo categorias...")
            response = requests.get(url, timeout=30)
            data = response.json()
            print(f"Categorias obtenidas: {len(data)}")
            return data
        except Exception as e:
            print(f"Error categorias: {e}")
            return []
    
    def get_live_streams(self):
        try:
            url = self.get_api_url('get_live_streams')
            print(f"Obteniendo streams...")
            response = requests.get(url, timeout=60)
            data = response.json()
            print(f"Streams obtenidos: {len(data)}")
            return data
        except Exception as e:
            print(f"Error streams: {e}")
            return []
    
    def fetch_all_channels(self):
        categories = self.get_live_categories()
        cat_dict = {}
        for cat in categories:
            cat_dict[cat.get('category_id')] = cat.get('category_name', 'Sin categoria')
        
        streams = self.get_live_streams()
        
        for stream in streams:
            stream_id = stream.get('stream_id')
            if stream_id:
                url = f"{self.host}/live/{self.username}/{self.password}/{stream_id}.ts"
                channel = {
                    'name': stream.get('name', 'Sin nombre'),
                    'tvg_id': stream.get('epg_channel_id', ''),
                    'tvg_logo': stream.get('stream_icon', ''),
                    'group': cat_dict.get(stream.get('category_id'), 'Sin categoria'),
                    'url': url
                }
                self.channels.append(channel)
        
        print(f"Total canales procesados: {len(self.channels)}")
        return self.channels
    
    def generate_m3u(self, filename):
        # Crear carpeta output siempre
        os.makedirs('output', exist_ok=True)
        
        print(f"Generando archivo: {filename}")
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write('#EXTM3U\n')
            f.write(f'# Generado: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
            f.write(f'# Total: {len(self.channels)} canales\n\n')
            
            for ch in self.channels:
                line = '#EXTINF:-1'
                
                if ch['tvg_id']:
                    line += f' tvg-id="{ch["tvg_id"]}"'
                if ch['tvg_logo']:
                    line += f' tvg-logo="{ch["tvg_logo"]}"'
                if ch['group']:
                    line += f' group-title="{ch["group"]}"'
                
                line += f',{ch["name"]}'
                
                f.write(line + '\n')
                f.write(ch['url'] + '\n')
        
        print(f"Archivo creado: {filename}")
        print(f"Canales escritos: {len(self.channels)}")


def main():
    print("=" * 50)
    print("XTREAM TO M3U CONVERTER")
    print("=" * 50)
    
    # Crear carpeta output al inicio
    os.makedirs('output', exist_ok=True)
    
    # Leer config
    try:
        with open('config.json', 'r') as f:
            config = json.load(f)
        print("Config cargado correctamente")
    except Exception as e:
        print(f"Error leyendo config: {e}")
        return
    
    for server in config['servers']:
        print(f"\n--- Servidor: {server['name']} ---")
        print(f"Host: {server['host']}")
        
        converter = XtreamToM3U(
            server['host'],
            server['username'],
            server['password']
        )
        
        if converter.test_connection():
            converter.fetch_all_channels()
            
            if len(converter.channels) > 0:
                converter.generate_m3u(config['output'])
            else:
                print("No se encontraron canales")
                # Crear archivo vacio para que git tenga algo
                with open(config['output'], 'w') as f:
                    f.write('#EXTM3U\n')
                    f.write('# No se encontraron canales\n')
        else:
            print("No se pudo conectar al servidor")
    
    # Verificar que el archivo existe
    if os.path.exists(config['output']):
        size = os.path.getsize(config['output'])
        print(f"\nArchivo final: {config['output']} ({size} bytes)")
    else:
        print("\nError: No se creo el archivo")


if __name__ == '__main__':
    main()
