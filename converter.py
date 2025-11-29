import requests
import json
import os
from datetime import datetime

class XtreamToM3U:
    def __init__(self, host, username, password):
        self.host = host.rstrip('/')
        self.username = username
        self.password = password
        self.base_url = f"{self.host}/player_api.php"
        self.channels = []
        
    def get_api_url(self, action=None):
        url = f"{self.base_url}?username={self.username}&password={self.password}"
        if action:
            url += f"&action={action}"
        return url
    
    def test_connection(self):
        try:
            response = requests.get(self.get_api_url(), timeout=15)
            data = response.json()
            if data.get('user_info'):
                print(f"Conexion exitosa!")
                print(f"Usuario: {data['user_info'].get('username')}")
                print(f"Estado: {data['user_info'].get('status')}")
                return True
            return False
        except Exception as e:
            print(f"Error: {e}")
            return False
    
    def get_live_categories(self):
        try:
            response = requests.get(self.get_api_url('get_live_categories'), timeout=15)
            return response.json()
        except:
            return []
    
    def get_live_streams(self):
        try:
            response = requests.get(self.get_api_url('get_live_streams'), timeout=30)
            return response.json()
        except:
            return []
    
    def build_stream_url(self, stream_id):
        return f"{self.host}/live/{self.username}/{self.password}/{stream_id}.ts"
    
    def fetch_all_channels(self):
        print("Obteniendo canales...")
        
        categories = self.get_live_categories()
        cat_dict = {cat['category_id']: cat['category_name'] for cat in categories}
        print(f"Categorias: {len(categories)}")
        
        streams = self.get_live_streams()
        print(f"Canales: {len(streams)}")
        
        for stream in streams:
            channel = {
                'name': stream.get('name', 'Sin nombre'),
                'tvg_id': stream.get('epg_channel_id', ''),
                'tvg_logo': stream.get('stream_icon', ''),
                'group': cat_dict.get(stream.get('category_id'), 'Sin categoria'),
                'url': self.build_stream_url(stream.get('stream_id'))
            }
            self.channels.append(channel)
        
        return self.channels
    
    def generate_m3u(self, filename='playlist.m3u'):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write('#EXTM3U\n')
            f.write(f'# Generado: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
            f.write(f'# Total: {len(self.channels)} canales\n\n')
            
            for ch in self.channels:
                extinf = '#EXTINF:-1'
                if ch.get('tvg_id'):
                    extinf += f' tvg-id="{ch["tvg_id"]}"'
                if ch.get('tvg_logo'):
                    extinf += f' tvg-logo="{ch["tvg_logo"]}"'
                if ch.get('group'):
                    extinf += f' group-title="{ch["group"]}"'
                extinf += f',{ch["name"]}\n'
                
                f.write(extinf)
                f.write(f'{ch["url"]}\n')
        
        print(f"Generado: {filename} ({len(self.channels)} canales)")


def main():
    print("=" * 40)
    print("XTREAM TO M3U CONVERTER")
    print("=" * 40)
    
    with open('config.json', 'r') as f:
        config = json.load(f)
    
    for server in config['servers']:
        print(f"\nProcesando: {server['name']}")
        
        converter = XtreamToM3U(
            server['host'],
            server['username'],
            server['password']
        )
        
        if converter.test_connection():
            converter.fetch_all_channels()
            converter.generate_m3u(config['output'])


if __name__ == '__main__':
    main()
