import json
import os
import pymysql
import certifi
import requests
import time
from decimal import Decimal
from dotenv import load_dotenv

# Load kredensial dari file .env
load_dotenv()

def get_ollama_embedding(text):
    try:
        url = "http://localhost:11434/api/embeddings"
        payload = {
            "model": "bge-m3:567m",
            "prompt": text
        }
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()["embedding"]
    except Exception as e:
        print(f"Error saat mengambil embedding Ollama: {e}")
        return None


DB_HOST = os.getenv("TIDB_HOST")
DB_USER = os.getenv("TIDB_USER")
DB_PASSWORD = os.getenv("TIDB_PASSWORD")
DB_NAME = os.getenv("TIDB_NAME")

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME, port=4000,
        ssl_verify_cert=True, ssl_verify_identity=True, ssl_ca=certifi.where()
    )

def main():
    print("[START] Memulai pembuatan Arsitektur Hybrid (dengan kolom BBM) di TiDB...")
    koneksi = get_db_connection()
    cursor = koneksi.cursor()

    # 1. BUAT TABEL HYBRID (SQL + JSON + Vector)
    print("Mempersiapkan tabel data_mobil_hybrid...")
    cursor.execute("DROP TABLE IF EXISTS data_mobil_hybrid")
    tabel_sql = """
    CREATE TABLE data_mobil_hybrid (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipe_mobil VARCHAR(100) NOT NULL,
        varian VARCHAR(100) NOT NULL,
        harga DECIMAL(15, 2) NOT NULL,
        bbm_kota DECIMAL(5, 2),
        bbm_tol DECIMAL(5, 2),
        spesifikasi_detail JSON,
        embedding VECTOR(1024)
    )
    """
    cursor.execute(tabel_sql)
    
    # 2. BACA FILE JSON
    try:
        with open('new-json/mpv.json', 'r') as file:
            data_mobil = json.load(file)
        print(f"Membaca {len(data_mobil)} varian mobil. Memulai proses Embedding...")
    except FileNotFoundError:
        print("[ERROR] File mpv.json tidak ditemukan!")
        return

    # 3. PROSES EMBEDDING & INSERT
    for index, mobil in enumerate(data_mobil):
        print(f"[{index+1}/{len(data_mobil)}] Memproses (Ollama BGE LOKAL): {mobil['tipe_mobil']} {mobil['varian']}...")
        
        harga_bersih = Decimal(mobil['harga'].replace('.', ''))
        spek_json_str = json.dumps(mobil['spesifikasi'])
        
        # Baca data BBM langsung dari field JSON
        raw_kota = mobil.get('est_bbm_kota', 'N/A').replace(' km/l', '').strip()
        raw_tol = mobil.get('est_bbm_tol', 'N/A').replace(' km/l', '').strip()
        bbm_kota = Decimal(raw_kota) if raw_kota.isdigit() else Decimal(0)
        bbm_tol = Decimal(raw_tol) if raw_tol.isdigit() else Decimal(0)
        
        teks_untuk_ai = f"Mobil: {mobil['tipe_mobil']} {mobil['varian']}. Spesifikasi: {spek_json_str}"
        
        # Dapatkan Vektor dari Ollama LOKAL bge-m3:567m
        try:
            vektor = get_ollama_embedding(teks_untuk_ai)
            if vektor is None:
                print(f"[ERROR] Gagal mendapatkan embedding dari Ollama")
                break
            vektor_str = str(vektor)
            
            # Insert ke TiDB (dengan data BBM)
            sql_insert = """
            INSERT INTO data_mobil_hybrid (tipe_mobil, varian, harga, bbm_kota, bbm_tol, spesifikasi_detail, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql_insert, (mobil['tipe_mobil'], mobil['varian'], harga_bersih, bbm_kota, bbm_tol, spek_json_str, vektor_str))
        except Exception as e:
            print(f"[ERROR] Gagal menghubungi Ollama: {e}")
            break
        
        time.sleep(0.1)

    koneksi.commit()
    cursor.close()
    koneksi.close()
    print("[DONE] SUKSES! Database Hybrid dengan kolom BBM siap digunakan.")

if __name__ == "__main__":
    main()