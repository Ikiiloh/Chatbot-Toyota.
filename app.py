import streamlit as st
import os
import time
import pymysql
import certifi
from gradio_client import Client
from dotenv import load_dotenv
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
import re

# --- 1. SETUP KREDENSIAL ---
load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Inisialisasi client Hugging Face dengan timeout lebih lama (120 detik)
client = Client("Ikiiloh/RAG-CAR", httpx_kwargs={"timeout": 120.0})

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

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("TIDB_HOST"), user=os.getenv("TIDB_USER"), 
        password=os.getenv("TIDB_PASSWORD"), database=os.getenv("TIDB_NAME"), port=4000,
        ssl_verify_cert=True, ssl_verify_identity=True, ssl_ca=certifi.where()
    )

def ekstrak_budget(teks):
    # Mencari pola angka seperti "300 juta", "1.5 m", "500 rb", atau "300.000.000"
    teks = teks.lower().replace(',', '.') # Standarisasi koma ke titik untuk desimal
    
    # Pola untuk angka desimal + unit (milyar/juta/ribu)
    # Group 1: angka (termasuk desimal), Group 2: unit
    pola_unit = re.findall(r'(\d+(?:\.\d+)?)\s*(milyar|miliar|m|juta|jt|jt-an|jutaan|ribu|rb|rb-an|ribuan)', teks)
    
    if pola_unit:
        angka = float(pola_unit[0][0])
        unit = pola_unit[0][1]
        
        if any(u in unit for u in ['milyar', 'miliar', 'm']):
            return int(angka * 1000000000)
        elif any(u in unit for u in ['juta', 'jt']):
            return int(angka * 1000000)
        elif any(u in unit for u in ['ribu', 'rb']):
            return int(angka * 1000)
    
    # Jika kustomer mengetik angka penuh (misal: 300000000)
    pola_angka = re.findall(r'(\d{5,10})', teks) # Minimal 5 digit (puluh ribu)
    if pola_angka:
        return int(pola_angka[0])
        
    return None

def deteksi_irit(teks):
    """Deteksi jika user menanyakan tentang keiritan/kehematan BBM."""
    kata_kunci = ['irit', 'hemat', 'efisien', 'bbm', 'bahan bakar', 'konsumsi', 'km/l', 'kpl']
    teks_lower = teks.lower()
    return any(k in teks_lower for k in kata_kunci)

def deteksi_non_hybrid(teks):
    """Deteksi jika user secara eksplisit tidak mau mobil hybrid."""
    kata_kunci_negatif = [
        'bukan hybrid', 'non hybrid', 'tanpa hybrid', 'bukan hev', 
        'bensin saja', 'bukan listrik', 'tanpa listrik', 'kecuali hybrid',
        'selain hybrid', 'no hybrid'
    ]
    teks_lower = teks.lower()
    return any(k in teks_lower for k in kata_kunci_negatif)

# --- 2. FUNGSI PENCARIAN RAG (VECTOR SEARCH) ---
def cari_konteks_hybrid(pertanyaan_user):
    # 1. Deteksi kriteria eksplisit
    budget_user = ekstrak_budget(pertanyaan_user)
    query_irit = deteksi_irit(pertanyaan_user)
    exclude_hybrid = deteksi_non_hybrid(pertanyaan_user)
    
    print(f"[DEBUG] Irit: {query_irit}, Exclude Hybrid: {exclude_hybrid}, Budget: {budget_user}")

    # 2. Dapatkan Vektor dari HuggingFace Space
    vektor = get_huggingface_embedding(pertanyaan_user)
    if not vektor:
        print("Error mendapatkan embedding dari Hugging Face")
        return ""
        
    vektor_user = str(vektor)

    koneksi = get_db_connection()
    konteks_terkumpul = ""
    
    try:
        with koneksi.cursor(pymysql.cursors.DictCursor) as cursor:
            # JIKA USER MENYEBUTKAN BUDGET
            if budget_user:
                # Ambil 1 varian terbaik per tipe_mobil (diversitas), filter harga
                # Jika tanya irit, urutkan berdasarkan bbm_kota DESC
                order_clause = "bbm_kota DESC, jarak ASC" if query_irit else "ABS(harga - %s) ASC, jarak ASC"
                
                # Tambahkan filter exclude hybrid jika diperlukan (Filter Ketat)
                hybrid_filter = ""
                if exclude_hybrid:
                    hybrid_filter = """
                    AND tipe_mobil NOT LIKE '%%Hybrid%%' 
                    AND varian NOT LIKE '%%Hybrid%%' 
                    AND varian NOT LIKE '%%HEV%%'
                    AND spesifikasi_detail NOT LIKE '%%Hybrid%%'
                    AND spesifikasi_detail NOT LIKE '%%HEV%%'
                    """
                
                sql = f"""
                SELECT tipe_mobil, varian, harga, spesifikasi_detail, jarak, bbm_kota, bbm_tol FROM (
                    SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol,
                           vec_cosine_distance(embedding, %s) AS jarak,
                           ROW_NUMBER() OVER (PARTITION BY tipe_mobil ORDER BY {"bbm_kota DESC" if query_irit else "vec_cosine_distance(embedding, %s)"}) AS rn
                    FROM data_mobil_hybrid
                    WHERE harga <= %s {hybrid_filter}
                ) ranked
                WHERE rn = 1
                ORDER BY {order_clause}
                LIMIT 3
                """
                # JIKA IRIT: %s ada 2 (jarak, harga) -> params (vektor, budget)
                # JIKA NORMAL: %s ada 4 (jarak, rn, harga, order) -> params (vektor, vektor, budget, budget)
                params = (vektor_user, budget_user) if query_irit else (vektor_user, vektor_user, budget_user, budget_user)
                cursor.execute(sql, params)
            else:
                # Ambil 1 varian terbaik per tipe_mobil (diversitas), pencarian vektor murni
                # Jika tanya irit, urutkan berdasarkan bbm_kota DESC
                order_clause = "bbm_kota DESC, jarak ASC" if query_irit else "jarak ASC"
                
                # Tambahkan filter exclude hybrid jika diperlukan (Filter Ketat)
                hybrid_filter = ""
                if exclude_hybrid:
                    hybrid_filter = """
                    WHERE tipe_mobil NOT LIKE '%%Hybrid%%' 
                    AND varian NOT LIKE '%%Hybrid%%' 
                    AND varian NOT LIKE '%%HEV%%'
                    AND spesifikasi_detail NOT LIKE '%%Hybrid%%'
                    AND spesifikasi_detail NOT LIKE '%%HEV%%'
                    """
                
                sql = f"""
                SELECT tipe_mobil, varian, harga, spesifikasi_detail, jarak, bbm_kota, bbm_tol FROM (
                    SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol,
                           vec_cosine_distance(embedding, %s) AS jarak,
                           ROW_NUMBER() OVER (PARTITION BY tipe_mobil ORDER BY {"bbm_kota DESC" if query_irit else "vec_cosine_distance(embedding, %s)"}) AS rn
                    FROM data_mobil_hybrid
                    {hybrid_filter}
                ) ranked
                WHERE rn = 1
                ORDER BY {order_clause}
                LIMIT 3
                """
                params = (vektor_user,) if query_irit else (vektor_user, vektor_user)
                cursor.execute(sql, params)

                
            hasil = cursor.fetchall()
            
            # Jika budget terlalu rendah sehingga hasil kosong, cari yang paling mendekati harganya
            if not hasil and budget_user:
                cursor.execute("""
                    SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak 
                    FROM data_mobil_hybrid 
                    ORDER BY ABS(harga - %s) ASC LIMIT 3
                """, (budget_user,))
                hasil = cursor.fetchall()

            for row in hasil:
                harga_raw = float(row['harga'])
                harga_formatted = "{:,.0f}".format(harga_raw).replace(',', '.')
                konteks_terkumpul += f"\n- MOBIL: {row['tipe_mobil']} {row['varian']}\n"
                konteks_terkumpul += f"  HARGA: Rp {harga_formatted} (OTR Labuhanbatu)\n"
                konteks_terkumpul += f"  KONSUMSI BBM (DALAM KOTA): {row['bbm_kota']} km/l\n"
                konteks_terkumpul += f"  KONSUMSI BBM (LUAR KOTA/TOL): {row['bbm_tol']} km/l\n"
                konteks_terkumpul += f"  DETAIL FITUR: {row['spesifikasi_detail']}\n"
                if 'jarak' in row:
                    konteks_terkumpul += f"  (Relevansi: {row['jarak']:.4f})\n"
    finally:
        koneksi.close()
    return konteks_terkumpul

# --- 3. GENERATE JAWABAN GEMINI ---
def tanya_gemini(pertanyaan, konteks_db, max_retry=5):
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    system_prompt = f"""
    Anda adalah Sales Executive profesional, ramah, dan solutif dari Auto2000 Rantauprapat. 
    Tugas Anda adalah melayani kustomer yang bertanya mengenai lini mobil terbaru Toyota.

    INFORMASI PENTING UNTUK ANDA:
    1. Semua mobil dalam database adalah unit terbaru Toyota.
    2. Harga yang tertera merupakan harga On The Road (OTR) untuk wilayah Labuhanbatu, kecuali yang "segmentation" nya bertuliskan "Estimasi OTR Jakarta".
    3. Sumber data utama Anda adalah <data_database> di bawah ini.

    <data_database>
    {konteks_db}
    </data_database>
    
    PEDOMAN GAYA BAHASA & LOGIKA JAWABAN:
    1. PERSONA SALES: Gunakan bahasa yang sopan, hangat (misal menyapa dengan 'Bapak/Ibu'), dan profesional. Jelaskan fitur secara menyeluruh namun sederhana agar kustomer tidak bingung.
    2. VALIDASI DATA: Jawab kustomer berdasarkan data yang ada. Jika informasi spesifik (seperti fitur tertentu) tidak ditemukan, jelaskan dengan jujur bahwa data tersebut tidak tercantum dalam brosur digital saat ini dan sarankan kustomer untuk datang langsung ke dealer untuk cek unit.
    3. LOGIKA REKOMENDASI (CROSS-SELLING): Jika kustomer mencari mobil tertentu yang TIDAK ADA di database, jangan langsung menolak. Lihat kriteria mereka (misal: mencari mobil keluarga, atau mobil irit). Cari mobil lain di <data_database> yang memiliki kemiripan kriteria, lalu berikan rekomendasi dengan kalimat: "Mohon maaf, unit [Mobil A] belum tersedia di data kami, namun berdasarkan keinginan Bapak/Ibu yang mencari mobil [Kriteria], saya sangat merekomendasikan [Mobil B] karena..."
    4. HARGA: Selalu informasikan bahwa harga tersebut adalah harga OTR Labuhanbatu untuk membantu kustomer menghitung budget mereka.
    5. STRUKTUR: Gunakan bullet points atau penomoran agar penjelasan fitur mudah dipahami.
    6. LOGIKA KEIRITAN (SANGAT PENTING - GROUND TRUTH): 
       a) Gunakan field "KONSUMSI BBM (DALAM KOTA)" dan "KONSUMSI BBM (LUAR KOTA/TOL)" di atas sebagai acuan utama Anda.
       b) Bandingkan angka tersebut secara matematis. Semakin tinggi angkanya, semakin irit mobil tersebut.
       c) Prioritaskan mobil dengan angka tertinggi saat kustomer bertanya tentang "paling irit" atau "hemat bbm".
       d) Abaikan bahasa marketing jika bertentangan dengan angka bbm yang tertera.
    7. PERINGATAN HARGA: Jika kustomer mencari harga yang JAUH di bawah unit termurah yang tersedia (misal cari 100jt tapi unit termurah 170jt), sampaikan dengan jujur bahwa unit di range 100jt pas belum tersedia, namun tawarkan unit terdekat (seperti Calya) sambil menyebutkan selisih harganya agar kustomer tidak kaget.
    7. RENTANG HARGA & VARIAN (SANGAT PENTING): Jika kustomer bertanya secara umum tentang suatu model mobil (contoh: "Berapa harga Avanza?", "Tanya Innova Zenix dong"), Anda WAJIB memberikan informasi rentang harga berdasarkan <data_database>. Sebutkan tipe terendah/termurahnya beserta harganya, dan tipe tertinggi/termahalnya beserta harganya. (Misal: "Harga Toyota Avanza OTR Labuhanbatu dibanderol mulai dari Rp X untuk tipe [Tipe A], hingga tipe tertingginya yaitu [Tipe B] di kisaran Rp Y").
    8. PERBANDINGAN HARGA: Jika kustomer mencari mobil 'termurah' atau 'termahal', Anda WAJIB membandingkan harga semua unit yang ada di <data_database> secara matematis sebelum memberikan jawaban agar tidak salah merekomendasikan.
    """
    
    # Retry otomatis dengan exponential backoff untuk DeadlineExceeded & ResourceExhausted (429)
    for attempt in range(max_retry):
        try:
            response = model.generate_content(
                system_prompt + "\n\nPertanyaan Kustomer: " + pertanyaan,
                generation_config=genai.GenerationConfig(temperature=0.2),
                request_options={"timeout": 300}  # Timeout 300 detik (5 menit)
            )
            return response.text
        except google_exceptions.ResourceExhausted:
            # Rate limit / quota exceeded (HTTP 429) — tunggu lebih lama
            wait_time = min(2 ** attempt * 5, 60)  # 5s, 10s, 20s, 40s, 60s
            if attempt < max_retry - 1:
                time.sleep(wait_time)
                continue
            else:
                raise
        except google_exceptions.DeadlineExceeded:
            # Timeout — retry dengan backoff ringan
            wait_time = 2 ** attempt  # 1s, 2s, 4s, 8s, 16s
            if attempt < max_retry - 1:
                time.sleep(wait_time)
                continue
            else:
                raise

# --- 4. UI STREAMLIT ---
st.set_page_config(page_title="Asisten Toyota Auto2000", page_icon="🚗")
st.title("🚗 Asisten Pintar Auto2000")
st.caption("Prototipe RAG Hybrid (SQL + JSON + Vector) - TiDB & Gemini")

# Bagian yang diubah:
if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant", 
            "content": """
            Selamat datang di **Layanan Konsultasi Digital Auto2000 Rantauprapat**! 🚗✨

            Saya adalah asisten virtual yang siap membantu Bapak/Ibu menemukan unit Toyota terbaik dengan harga **OTR Labuhanbatu**. 
            
            Jika Bapak/Ibu bingung ingin bertanya apa, berikut adalah beberapa hal yang bisa saya informasikan:
            
            * **Cek Harga & Budget:** *"Tampilkan mobil keluarga dengan budget di bawah 500 juta."*
            * **Detail Spesifikasi:** *"Apa saja fitur keamanan yang ada di Innova Zenix tipe Q?"*
            * **Perbandingan Varian:** *"Apa perbedaan antara Alphard tipe bensin dengan tipe Hybrid?"*
            * **Rekomendasi Kebutuhan:** *"Saya mencari mobil yang sangat irit untuk operasional harian."*
            * **Kapasitas:** *"Mobil apa yang muat untuk 7 orang penumpang dengan kenyamanan VIP?"*

            Ada yang bisa saya bantu jelaskan lebih lanjut mengenai unit Toyota hari ini?
            """
        }
    ]
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if user_input := st.chat_input("Tanya spesifikasi atau harga di sini..."):
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)
    
    with st.sidebar:
        st.header("💡 Panduan Bertanya")
        st.write("""
        Gunakan kriteria berikut agar saya bisa memberikan jawaban terbaik:
        1. **Sebutkan Budget:** Misal 'di bawah 300 juta'.
        2. **Sebutkan Fitur:** Misal 'yang punya TSS' atau 'Hybrid'.
        3. **Sebutkan Tipe:** Misal 'Avanza' atau 'Innova'.
    """)
    st.info("Semua harga adalah estimasi OTR Labuhanbatu.")

    with st.chat_message("assistant"):
        with st.spinner("Mencari di Database TiDB..."):
            try:
                konteks = cari_konteks_hybrid(user_input)
                jawaban = tanya_gemini(user_input, konteks)
                st.markdown(jawaban)
                
                with st.expander("🔍 Intip Data TiDB (Khusus Dosen Penguji)"):
                    st.code(konteks, language="json")
                    
            except google_exceptions.ResourceExhausted:
                jawaban = "⚠️ Mohon maaf, kuota API Gemini sedang penuh (rate limit). Sistem sudah mencoba ulang beberapa kali. Silakan tunggu 1-2 menit lalu coba lagi."
                st.warning(jawaban)
            except google_exceptions.DeadlineExceeded:
                jawaban = "⏳ Mohon maaf, server AI sedang sibuk dan membutuhkan waktu lebih lama. Silakan coba kirim pertanyaan Anda sekali lagi."
                st.warning(jawaban)
            except Exception as e:
                jawaban = "⚠️ Terjadi kesalahan pada sistem saat melakukan pencarian data."
                st.error(jawaban)
                with st.expander("🛠️ Detail Error Sistem (Untuk Debugging)"):
                    st.error(f"Pesan Kesalahan:\n{str(e)}")
            
    st.session_state.messages.append({"role": "assistant", "content": jawaban})