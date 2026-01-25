import os
import math
import requests
import time

# --- CONFIGURACIÓN FIUNA (SAN LORENZO) ---
LAT = -25.3316
LON = -57.5171

ZOOM_MIN = 12
ZOOM_MAX = 16   # Zoom 16 es suficiente para ver las calles internas de la UNA
RADIO_KM = 5    # 5 km a la redonda cubre todo el campus y alrededores

# ---------------------------------------

def deg2num(lat_deg, lon_deg, zoom):
  lat_rad = math.radians(lat_deg)
  n = 2.0 ** zoom
  xtile = int((lon_deg + 180.0) / 360.0 * n)
  ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
  return (xtile, ytile)

def download_tile(z, x, y):
    url = f"https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
    path = f"public/maps/{z}/{x}/{y}.png"
    
    if os.path.exists(path):
        print(f"✅ Ya existe: {z}/{x}/{y}")
        return

    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    try:
        headers = {'User-Agent': 'CCTE-Tracker/1.0'}
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            with open(path, 'wb') as f:
                f.write(response.content)
            print(f"⬇️  Descargado: {z}/{x}/{y}")
        else:
            print(f"❌ Error {response.status_code}: {url}")
    except Exception as e:
        print(f"⚠️ Error: {e}")
    
    time.sleep(0.05) # Un poco más rápido (50ms)

print(f"🚀 DESCARGANDO MAPA DE FIUNA (Radio: {RADIO_KM}km)...")

for z in range(ZOOM_MIN, ZOOM_MAX + 1):
    center_x, center_y = deg2num(LAT, LON, z)
    # Cálculo aproximado de tiles necesarios para el radio en este zoom
    # En el ecuador 1 grado ~= 111km.
    # Simplificación para cálculo de tiles a descargar
    range_tiles = int(RADIO_KM * (2**(z-15))) + 1
    if z < 14: range_tiles = 1 # Para zooms lejanos bajamos solo el central y vecinos
    
    print(f"\n--- Zoom {z} (Radio aprox: {range_tiles} tiles) ---")
    
    for x in range(center_x - range_tiles, center_x + range_tiles + 1):
        for y in range(center_y - range_tiles, center_y + range_tiles + 1):
            download_tile(z, x, y)

print("\n✅ ¡MAPA DE SAN LORENZO LISTO! Verifica la carpeta /public/maps")