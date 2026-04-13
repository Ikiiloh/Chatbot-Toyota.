import json
import os
import pymysql
import certifi
import google.generativeai as genai
from dotenv import load_dotenv
from decimal import Decimal

# Load kredensial dari file .env
load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

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
    print("[START] Memulai pembuatan Arsitektur Hybrid di TiDB...")
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
        spesifikasi_detail JSON,
        embedding VECTOR(3072)
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
        # for loading bar look alike
        print(f"[{index+1}/{len(data_mobil)}] Memproses: {mobil['tipe_mobil']} {mobil['varian']}...")
        
        # Bersihkan format harga (Hapus titik agar jadi angka murni) dan gunakan Decimal
        harga_bersih = Decimal(mobil['harga'].replace('.', ''))
        spek_json_str = json.dumps(mobil['spesifikasi'])
        teks_untuk_ai = f"Mobil: {mobil['tipe_mobil']} {mobil['varian']}. Spesifikasi: {spek_json_str}"
        
        # Dapatkan Vektor dari Gemini
        response = genai.embed_content(model="models/gemini-embedding-001", content=teks_untuk_ai)
        vektor_str = str(response['embedding'])
        
        # Insert ke TiDB
        sql_insert = """
        INSERT INTO data_mobil_hybrid (tipe_mobil, varian, harga, spesifikasi_detail, embedding)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(sql_insert, (mobil['tipe_mobil'], mobil['varian'], harga_bersih, spek_json_str, vektor_str))

    koneksi.commit()
    cursor.close()
    koneksi.close()
    print("[DONE] SUKSES! Database Hybrid siap digunakan.")

if __name__ == "__main__":
    main()