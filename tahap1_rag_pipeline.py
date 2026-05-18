"""
TAHAP 1: JALANKAN RAG PIPELINE & SIMPAN HASIL
"""
import json, os, time, sys, re
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import pymysql, certifi
import requests
from dotenv import load_dotenv
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

from gradio_client import Client

client = Client("Ikiiloh/RAG-CAR")

def get_huggingface_embedding(text):
    try:
        result = client.predict(
            text=text,
            api_name="/on_click"
        )
        # API mengembalikan tuple (dense_vector, markdown), ambil vektor saja
        if isinstance(result, tuple):
            return result[0]
        return result
    except Exception as e:
        print(f"Error saat mengambil embedding: {e}")
        return None

load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY_RAG")
if not API_KEY:
    print("ERROR: GOOGLE_API_KEY_RAG tidak ditemukan!"); sys.exit(1)
genai.configure(api_key=API_KEY)

MODEL_RAG = "gemini-2.5-flash"
JEDA = 30
MAX_TC = 30
OUTPUT = "hasil_rag_pipeline.json"

def get_db():
    return pymysql.connect(
        host=os.getenv("TIDB_HOST"), user=os.getenv("TIDB_USER"),
        password=os.getenv("TIDB_PASSWORD"), database=os.getenv("TIDB_NAME"),
        port=4000, ssl_verify_cert=True, ssl_verify_identity=True, ssl_ca=certifi.where())

def ekstrak_budget(t):
    t = t.lower()
    p = re.findall(r"(\d+)\s*(juta|jt|jt-an|jutaan)", t)
    if p: return int(p[0][0]) * 1000000
    a = re.findall(r"(\d{7,10})", t)
    return int(a[0]) if a else None

def cari_konteks(q):
    b = ekstrak_budget(q)
    try:
        vektor = get_huggingface_embedding(q)
        if not vektor:
            return "", []
        v = str(vektor)
    except Exception as e:
        print(f"Error HuggingFace Embedding: {e}")
        return "", []
        
    conn = get_db()
    chunks = []
    raw = ""
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            if b:
                cur.execute("""SELECT tipe_mobil, varian, harga, spesifikasi_detail,
                    vec_cosine_distance(embedding, %s) AS j FROM data_mobil_hybrid
                    WHERE harga <= %s * 1.1 ORDER BY j ASC LIMIT 3""", (v, b))
            else:
                cur.execute("""SELECT tipe_mobil, varian, harga, spesifikasi_detail,
                    vec_cosine_distance(embedding, %s) AS j FROM data_mobil_hybrid
                    ORDER BY j ASC LIMIT 3""", (v,))
            rows = cur.fetchall()
            if not rows and b:
                cur.execute("""SELECT tipe_mobil, varian, harga, spesifikasi_detail, 0 as j
                    FROM data_mobil_hybrid ORDER BY ABS(harga - %s) ASC LIMIT 3""", (b,))
                rows = cur.fetchall()
            for r in rows:
                c = f"Tipe: {r['tipe_mobil']} {r['varian']}\nHarga: Rp {r['harga']:,.0f}\nSpesifikasi: {r['spesifikasi_detail']}\n"
                raw += c + "\n"; chunks.append(c)
    finally:
        conn.close()
    return raw, chunks

def tanya(q, ctx, retry=5):
    m = genai.GenerativeModel(MODEL_RAG)
    prompt = f"""
    Anda adalah Sales Executive profesional, ramah, dan solutif dari Auto2000 Rantauprapat. 
    Tugas Anda adalah melayani kustomer yang bertanya mengenai lini mobil terbaru Toyota.

    INFORMASI PENTING UNTUK ANDA:
    1. Semua mobil dalam database adalah unit terbaru Toyota.
    2. Harga yang tertera merupakan harga On The Road (OTR) untuk wilayah Labuhanbatu.
    3. Sumber data utama Anda adalah <data_database> di bawah ini.

    <data_database>
    {ctx}
    </data_database>
    
    PEDOMAN GAYA BAHASA & LOGIKA JAWABAN:
    1. PERSONA SALES: Gunakan bahasa yang sopan, hangat (misal menyapa dengan 'Bapak/Ibu'), dan profesional. Jelaskan fitur secara menyeluruh namun sederhana agar kustomer tidak bingung.
    2. VALIDASI DATA: Jawab kustomer berdasarkan data yang ada. Jika informasi spesifik (seperti fitur tertentu) tidak ditemukan, jelaskan dengan jujur bahwa data tersebut tidak tercantum dalam brosur digital saat ini dan sarankan kustomer untuk datang langsung ke dealer untuk cek unit.
    3. LOGIKA REKOMENDASI (CROSS-SELLING): Jika kustomer mencari mobil tertentu yang TIDAK ADA di database, jangan langsung menolak. Lihat kriteria mereka (misal: mencari mobil keluarga, atau mobil irit). Cari mobil lain di <data_database> yang memiliki kemiripan kriteria, lalu berikan rekomendasi dengan kalimat: "Mohon maaf, unit [Mobil A] belum tersedia di data kami, namun berdasarkan keinginan Bapak/Ibu yang mencari mobil [Kriteria], saya sangat merekomendasikan [Mobil B] karena..."
    4. HARGA: Selalu informasikan bahwa harga tersebut adalah harga OTR Labuhanbatu untuk membantu kustomer menghitung budget mereka.
    5. STRUKTUR: Gunakan bullet points atau penomoran agar penjelasan fitur mudah dipahami.
    6. PERINGATAN HARGA: Jika kustomer mencari harga yang JAUH di bawah unit termurah yang tersedia (misal cari 100jt tapi unit termurah 170jt), sampaikan dengan jujur bahwa unit di range 100jt pas belum tersedia, namun tawarkan unit terdekat (seperti Calya) sambil menyebutkan selisih harganya agar kustomer tidak kaget.
    7. RENTANG HARGA & VARIAN (SANGAT PENTING): Jika kustomer bertanya secara umum tentang suatu model mobil (contoh: "Berapa harga Avanza?", "Tanya Innova Zenix dong"), Anda WAJIB memberikan informasi rentang harga berdasarkan <data_database>. Sebutkan tipe terendah/termurahnya beserta harganya, dan tipe tertinggi/termahalnya beserta harganya. (Misal: "Harga Toyota Avanza OTR Labuhanbatu dibanderol mulai dari Rp X untuk tipe [Tipe A], hingga tipe tertingginya yaitu [Tipe B] di kisaran Rp Y").
    8. PERBANDINGAN HARGA: Jika kustomer mencari mobil 'termurah' atau 'termahal', Anda WAJIB membandingkan harga semua unit yang ada di <data_database> secara matematis sebelum memberikan jawaban agar tidak salah merekomendasikan.
    
    Pertanyaan Kustomer: {q}"""
    for a in range(retry):
        try:
            r = m.generate_content(prompt, generation_config=genai.GenerationConfig(temperature=0.2),
                request_options={"timeout": 300})
            return r.text
        except google_exceptions.ResourceExhausted:
            w = min(2**a * 15, 120)
            if a < retry-1: print(f"   >> Rate limit, tunggu {w}s..."); time.sleep(w)
            else: raise

def main():
    print("=" * 60)
    print(f"TAHAP 1: RAG PIPELINE (model: {MODEL_RAG})")
    print("=" * 60)

    prev = []
    if os.path.exists(OUTPUT):
        with open(OUTPUT, "r", encoding="utf-8") as f:
            prev = json.load(f).get("hasil", [])
        print(f">> {len(prev)} hasil sebelumnya ditemukan, skip.")

    with open("dataset_evaluasi.json", "r", encoding="utf-8") as f:
        ds = json.load(f)
    ds = ds[:MAX_TC]
    done = {h["nomor"] for h in prev}
    hasil = list(prev)

    for i, d in enumerate(ds, 1):
        if i in done: print(f"[{i}/{len(ds)}] SKIP"); continue
        print(f"\n[{i}/{len(ds)}] {d['input'][:55]}...")
        try:
            print("   >> Retrieval..."); raw, chunks = cari_konteks(d["input"])
            print(f"   >> Jeda {JEDA}s..."); time.sleep(JEDA)
            print("   >> Generation..."); out = tanya(d["input"], raw)
            hasil.append({"nomor": i, "input": d["input"], "expected_output": d["expected_output"],
                "actual_output": out, "retrieval_context": chunks})
            with open(OUTPUT, "w", encoding="utf-8") as f:
                json.dump({"waktu": datetime.now().isoformat(), "model_rag": MODEL_RAG,
                    "jumlah": len(hasil), "hasil": hasil}, f, ensure_ascii=False, indent=2)
            print(f"   >> BERHASIL!")
            if i < len(ds): print(f"   >> Jeda {JEDA}s...\n"); time.sleep(JEDA)
        except Exception as e:
            print(f"   >> GAGAL: {str(e)[:80]}")
            with open(OUTPUT, "w", encoding="utf-8") as f:
                json.dump({"waktu": datetime.now().isoformat(), "model_rag": MODEL_RAG,
                    "jumlah": len(hasil), "hasil": hasil}, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"TAHAP 1 SELESAI! {len(hasil)}/{len(ds)} berhasil.")
    print(f"Selanjutnya: python tahap2_evaluasi.py")
    print("=" * 60)

if __name__ == "__main__":
    main()
