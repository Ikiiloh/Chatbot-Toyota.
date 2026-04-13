# 🚗 Asisten Pintar Auto2000 — RAG Chatbot Toyota

> **Prototipe Sistem Chatbot Cerdas Berbasis Retrieval-Augmented Generation (RAG) untuk Layanan Informasi Produk Toyota Auto2000**

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-1.x-FF4B4B?logo=streamlit&logoColor=white)
![Gemini](https://img.shields.io/badge/Google%20Gemini-AI-4285F4?logo=google&logoColor=white)
![TiDB](https://img.shields.io/badge/TiDB-Serverless-6532FF?logo=pingcap&logoColor=white)

---

## 📖 Deskripsi

Proyek ini merupakan **skripsi** yang dikembangkan oleh mahasiswa Program Studi **Sistem Informasi**, Fakultas Sains dan Teknologi, **Universitas Islam Negeri (UIN) Imam Bonjol Padang**.

Sistem ini membangun sebuah **chatbot berbasis web** yang mampu menjawab pertanyaan pelanggan seputar spesifikasi, harga, dan rekomendasi mobil Toyota secara akurat dan kontekstual. Berbeda dengan chatbot konvensional yang hanya mengandalkan model bahasa, sistem ini menerapkan arsitektur **Retrieval-Augmented Generation (RAG)** yang menggabungkan pencarian data dari database dengan kemampuan generatif AI, sehingga jawaban yang dihasilkan selalu berdasarkan data faktual.

### 🎯 Tujuan Penelitian

1. Merancang dan membangun sistem chatbot cerdas berbasis RAG untuk meningkatkan layanan informasi produk pada dealer Toyota Auto2000.
2. Mengimplementasikan arsitektur **hybrid database** (SQL + JSON + Vector) menggunakan TiDB Serverless untuk penyimpanan dan pencarian data semantik.
3. Mengukur efektivitas pendekatan RAG dalam menghasilkan jawaban yang akurat dan relevan dibandingkan dengan model generatif tanpa konteks data.

---

## 🏗️ Arsitektur Sistem

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Pengguna   │────▶│  Streamlit Web   │────▶│  Gemini AI API   │
│  (Browser)   │◀────│   Interface      │◀────│  (Embedding +    │
└──────────────┘     └────────┬─────────┘     │   Generation)    │
                              │               └──────────────────┘
                              │
                     ┌────────▼─────────┐
                     │   TiDB Serverless │
                     │  ┌─────────────┐ │
                     │  │ SQL (Harga)  │ │
                     │  │ JSON (Spek)  │ │
                     │  │ Vector (RAG) │ │
                     │  └─────────────┘ │
                     └──────────────────┘
```

### Alur Kerja RAG:
1. **Input** — Pengguna mengetikkan pertanyaan melalui antarmuka chat.
2. **Embedding** — Pertanyaan diubah menjadi vektor menggunakan model `gemini-embedding-001`.
3. **Vector Search** — Sistem mencari data mobil paling relevan di TiDB menggunakan `cosine similarity`.
4. **Generation** — Data hasil pencarian diinjeksikan sebagai konteks ke model `gemini-2.5-flash` untuk menghasilkan jawaban natural dalam persona Sales Executive.
5. **Output** — Jawaban ditampilkan kepada pengguna beserta data pendukung dari database.

---

## 🛠️ Teknologi yang Digunakan

| Komponen | Teknologi | Fungsi |
|---|---|---|
| **Frontend** | Streamlit | Antarmuka web chatbot interaktif |
| **LLM** | Google Gemini 2.5 Flash | Generasi jawaban natural language |
| **Embedding** | Gemini Embedding 001 | Konversi teks ke vektor untuk pencarian semantik |
| **Database** | TiDB Serverless | Penyimpanan hybrid (SQL + JSON + Vector) |
| **Backend** | Python 3.10+ | Logika aplikasi dan integrasi API |

---

## 📁 Struktur Proyek

```
prototype/
├── app.py              # Aplikasi utama Streamlit (chatbot)
├── upload_data.py      # Script untuk memasukkan data ke TiDB
├── crud_hybrid.py      # Operasi CRUD pada database
├── new-json/           # Data spesifikasi mobil dalam format JSON
│   └── mpv.json
├── requirements.txt    # Daftar dependensi Python
├── .env                # Konfigurasi kredensial (tidak diupload)
└── .gitignore
```

---

## ⚙️ Instalasi & Penggunaan

### Prasyarat
- Python 3.10 atau lebih baru
- Akun [TiDB Cloud](https://tidbcloud.com/) (gratis)
- API Key [Google AI Studio](https://aistudio.google.com/)

### Langkah Instalasi

1. **Clone repository**
   ```bash
   git clone https://github.com/Ikiiloh/Toyota Chatbot.git
   cd Toyota Chatbot
   ```

2. **Install dependensi**
   ```bash
   pip install -r requirements.txt
   ```

3. **Konfigurasi environment variables**

   Buat file `.env` di root proyek:
   ```env
   GOOGLE_API_KEY=your_google_api_key
   TIDB_HOST=your_tidb_host
   TIDB_USER=your_tidb_user
   TIDB_PASSWORD=your_tidb_password
   TIDB_NAME=your_database_name
   ```

4. **Upload data ke database** (jalankan sekali)
   ```bash
   python upload_data.py
   ```

5. **Jalankan aplikasi**
   ```bash
   streamlit run app.py
   ```

6. Buka browser dan akses alamat url yang diberikan dari streamlit

## 📸 Tangkapan Layar

> <img width="1920" height="1020" alt="Screenshot 2026-04-13 100933" src="https://github.com/user-attachments/assets/3ce6d762-9aac-4834-a8bb-c654446a5449" /> <img width="1920" height="1020" alt="Screenshot 2026-04-13 101120" src="https://github.com/user-attachments/assets/f93c861d-a5a5-4cd2-b9f1-c8734000c016" /> <img width="1920" height="1020" alt="Screenshot 2026-04-13 002846" src="https://github.com/user-attachments/assets/e9cefd08-ad67-48be-8c84-60d3c420c067" />

---

## 👤 Penulis

**M.Riski Ramadani**
- Program Studi Sistem Informasi
- Fakultas Sains dan Teknologi
- Universitas Islam Negeri (UIN) Imam Bonjol Padang
- 📧 Email: muhriski148@gmail.com

---

<p align="center">
  <i>Dibuat sebagai bagian dari Tugas Skripsi — 2026</i>
</p>
