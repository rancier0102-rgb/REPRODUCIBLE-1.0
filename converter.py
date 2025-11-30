import requests
import json
import os
from datetime import datetime
import time

class XtreamToM3U:
    def __init__(self, host, username, password):
        self.host = host.rstrip('/')
        self.username = username
        self.password = password
        self.channels = []
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        })
        
    def get_api_url(self, action=None):
        url = f"{self.host}/player_api.php?username={self.username}&password={self.password}"
        if action:
            url += f"&action={action}"
        return url
    
    def make_request(self, url, retries=3):
        for i in range(retries):
            try:
                print(f"Intento {i+1}: {url[:80]}...")
                time.sleep(2)  # Esperar entre requests
                response = self.session.get(url, timeout=60)
                return response
            except Exception as e:
                print(f"Error intento {i+1}: {e}")
                time.sleep(5)
        return None
    
    def test_connection(self):
        print(f"Conectando a: {self.host}")
        response = self.make_request(self.get_api_url())
        
        if response is None:
            print("No se pudo conectar")
            return False
            
        print(f"Status: {response.status_code}")
        
        try:
            data = response.json()
            if data.get('user_info'):
                print(f"Usuario: {data['user_info'].get('username')}")
                print(f"Estado: {data['user_info'].get('status')}")
                return True
        except:
            print(f"Respuesta no es JSON: {response.text[:200]}")
        
        return False
    
    def get_live_categories(self):
        response = self.make_request(self.get_api_url('get_live_categories'))
        if response:
            try:
                data = response.json()
                print(f"Categorias: {len(data)}")
                return data
            except:
                pass
        return []
    
    def get_live_streams(self):
        response = self.make_request(self.get_api_url('get_live_streams'))
        if response:
            try:
                data = response.json()
                print(f"Streams: {len(data)}")
                return data
            except:
                pass
        return []
    
    def fetch_all_channels(self):
        categories = self.get_live_categories()
        cat_dict = {}
        for cat in categories:
            cat_dict[cat.get('category_id')] = cat.get('category_name', 'General')
        
        streams = self.get_live_streams()
        
        for stream in streams:
            stream_id = stream.get('stream_id')
            if stream_id:
                url = f"{self.host}/live/{self.username}/{self.password}/{stream_id}.ts"
                self.channels.append({
                    'name': stream.get('name', 'Sin nombre'),
                    'tvg_id': stream.get('epg_channel_id', ''),
                    'tvg_logo': stream.get('stream_icon', ''),
                    'group': cat_dict.get(stream.get('category_id'), 'General'),
                    'url': url
                })
        
        print(f"Total canales: {len(self.channels)}")
        return self.channels
    
    def generate_m3u(self, filename):
        os.makedirs('output', exist_ok=True)
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write('#EXTM3U\n')
            f.write(f'# Generado: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
            f.write(f'# Canales: {len(self.channels)}\n\n')
            
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


def main():
    print("=" * 50)
    print("XTREAM TO M3U CONVERTER")
    print("=" * 50)
    
    os.makedirs('output', exist_ok=True)
    
    with open('config.json', 'r') as f:
        config = json.load(f)
    
    for server in config['servers']:
        print(f"\nServidor: {server['name']}")
        
        converter = XtreamToM3U(
            server['host'],
            server['username'],
            server['password']
        )
        
        if converter.test_connection():
            converter.fetch_all_channels()
            if converter.channels:
                converter.generate_m3u(config['output'])
            else:
                print("Sin canales encontrados")


if __name__ == '__main__':
    main()
