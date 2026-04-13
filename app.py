import streamlit as st
import os
import time
import pymysql
import certifi
from dotenv import load_dotenv
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

# --- 1. SETUP KREDENSIAL ---
load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("TIDB_HOST"), user=os.getenv("TIDB_USER"), 
        password=os.getenv("TIDB_PASSWORD"), database=os.getenv("TIDB_NAME"), port=4000,
        ssl_verify_cert=True, ssl_verify_identity=True, ssl_ca=certifi.where()
    )

# --- 2. FUNGSI PENCARIAN RAG (VECTOR SEARCH) ---
def cari_konteks_hybrid(pertanyaan_user):
    # Ubah pertanyaan jadi vektor
    response_embed = genai.embed_content(model="models/gemini-embedding-001", content=pertanyaan_user)
    vektor_user = str(response_embed['embedding'])

    # Cari 3 mobil paling relevan di database
    koneksi = get_db_connection()
    konteks_terkumpul = ""
    try:
        with koneksi.cursor(pymysql.cursors.DictCursor) as cursor:
            sql = """
            SELECT tipe_mobil, varian, harga, spesifikasi_detail,
                   vec_cosine_distance(embedding, %s) AS jarak
            FROM data_mobil_hybrid
            ORDER BY jarak ASC
            LIMIT 3
            """
            cursor.execute(sql, (vektor_user,))
            hasil = cursor.fetchall()
            
            for row in hasil:
                konteks_terkumpul += f"Tipe: {row['tipe_mobil']} {row['varian']}\n"
                konteks_terkumpul += f"Harga: Rp {row['harga']:,.0f}\n"
                konteks_terkumpul += f"Spesifikasi: {row['spesifikasi_detail']}\n\n"
    finally:
        koneksi.close()
    return konteks_terkumpul

# --- 3. GENERATE JAWABAN GEMINI ---
def tanya_gemini(pertanyaan, konteks_db, max_retry=2):
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    system_prompt = f"""
    Anda adalah Sales Executive profesional, ramah, dan solutif dari Auto2000 Rantauprapat. 
    Tugas Anda adalah melayani kustomer yang bertanya mengenai lini mobil terbaru Toyota.

    INFORMASI PENTING UNTUK ANDA:
    1. Semua mobil dalam database adalah unit terbaru Toyota.
    2. Harga yang tertera merupakan harga On The Road (OTR) untuk wilayah Labuhanbatu.
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
    """
    
    # Retry otomatis jika timeout (DeadlineExceeded)
    for attempt in range(max_retry):
        try:
            response = model.generate_content(
                system_prompt + "\n\nPertanyaan Kustomer: " + pertanyaan,
                generation_config=genai.GenerationConfig(temperature=0.2),
                request_options={"timeout": 120}  # Timeout 120 detik
            )
            return response.text
        except google_exceptions.DeadlineExceeded:
            if attempt < max_retry - 1:
                time.sleep(2)  # Tunggu 2 detik sebelum retry
                continue
            else:
                raise

# --- 4. TAMPILAN WEB STREAMLIT ---
st.set_page_config(page_title="Asisten Toyota Auto2000", page_icon="🚗")
st.title("🚗 Asisten Pintar Auto2000")
st.caption("Prototipe RAG Hybrid (SQL + JSON + Vector) - TiDB & Gemini")

if "messages" not in st.session_state:
    st.session_state.messages = [{"role": "assistant", "content": "Halo! Saya asisten virtual Toyota Auto2000. Ada yang bisa saya bantu?"}]

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if user_input := st.chat_input("Tanya spesifikasi atau harga di sini..."):
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)
    
    with st.chat_message("assistant"):
        with st.spinner("Mencari di Database TiDB..."):
            try:
                konteks = cari_konteks_hybrid(user_input)
                jawaban = tanya_gemini(user_input, konteks)
                st.markdown(jawaban)
                
                with st.expander("🔍 Intip Data TiDB (Khusus Dosen Penguji)"):
                    st.code(konteks, language="json")
                    
            except google_exceptions.DeadlineExceeded:
                jawaban = "⏳ Mohon maaf, server AI sedang sibuk dan membutuhkan waktu lebih lama. Silakan coba kirim pertanyaan Anda sekali lagi."
                st.warning(jawaban)
            except Exception as e:
                jawaban = f"⚠️ Terjadi kesalahan: silakan coba lagi dalam beberapa saat."
                st.error(jawaban)
            
    st.session_state.messages.append({"role": "assistant", "content": jawaban})