import pymysql
import certifi
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("TIDB_HOST"), user=os.getenv("TIDB_USER"), 
        password=os.getenv("TIDB_PASSWORD"), database=os.getenv("TIDB_NAME"), port=4000,
        ssl_verify_cert=True, ssl_verify_identity=True, ssl_ca=certifi.where()
    )

def lihat_semua_data():
    print("\n--- 📖 DATABASE MOBIL AUTO2000 ---")
    koneksi = get_db_connection()
    with koneksi.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT id, tipe_mobil, varian, harga FROM data_mobil_hybrid")
        hasil = cursor.fetchall()
        for row in hasil:
            print(f"[{row['id']}] {row['tipe_mobil']} {row['varian']} - Rp {row['harga']:,.0f}")
    koneksi.close()

def edit_harga_mobil(id_mobil, harga_baru):
    koneksi = get_db_connection()
    with koneksi.cursor() as cursor:
        cursor.execute("UPDATE data_mobil_hybrid SET harga = %s WHERE id = %s", (harga_baru, id_mobil))
        koneksi.commit()
        print(f"✅ Harga mobil ID {id_mobil} berhasil diperbarui menjadi Rp {harga_baru:,.0f}!")
    koneksi.close()

def hapus_mobil(id_mobil):
    koneksi = get_db_connection()
    with koneksi.cursor() as cursor:
        cursor.execute("DELETE FROM data_mobil_hybrid WHERE id = %s", (id_mobil,))
        koneksi.commit()
        print(f"✅ Mobil ID {id_mobil} berhasil dihapus dari database!")
    koneksi.close()

if __name__ == "__main__":
    print("Selamat datang di Panel Admin!")
    # Tampilkan data saat ini
    lihat_semua_data()
    
    # === CONTOH PENGGUNAAN (Hapus tanda # untuk mencoba) ===
    # edit_harga_mobil(id_mobil=1, harga_baru=1500000000)
    # hapus_mobil(id_mobil=3)
    # lihat_semua_data()