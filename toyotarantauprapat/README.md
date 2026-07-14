# Toyota Smart Recommender (Auto2000 Assistant)

Toyota Smart Recommender adalah sistem AI interaktif yang dirancang untuk membantu kustomer menemukan rekomendasi mobil Toyota terbaik yang sesuai dengan profil, kebutuhan, dan anggaran mereka. 

Fokus utama dari proyek ini adalah implementasi **Sistem Rekomendasi AI berbasis Hybrid RAG (Retrieval-Augmented Generation)** yang menggabungkan kemampuan analisis bahasa alami dari LLM dengan pencarian data terstruktur dan pencarian vektor tingkat lanjut.

## 🧠 Arsitektur Hybrid RAG

Proyek ini mengadopsi pendekatan **Self-Querying Hybrid RAG Pipeline** yang sangat dioptimalkan untuk ranah otomotif, terdiri dari 3 tahapan utama:

### 1. Tahap Ekstraksi Niat (Self-Querying dengan Gemini)
Setiap pesan dari kustomer diproses terlebih dahulu oleh LLM (Gemini 3.1 Flash Lite) yang bertindak sebagai *Self-Querying Retriever*. LLM akan membedah pesan (dan riwayat percakapan) untuk mengekstrak struktur data (JSON) yang berisi:
*   `semantic_query`: Intisari dari apa yang dicari (diterjemahkan ke dalam glosarium teknis otomotif).
*   `budget_min` & `budget_max`: Pemahaman rentang harga secara matematis.
*   `exact_keywords` & `exclude_keywords`: Syarat mutlak fitur yang diinginkan atau tidak diinginkan.
*   `is_hybrid`, `seats`, `is_fuel_efficient`: Filter operasional dasar.

### 2. Tahap Retrieval Hybrid (TiDB + HuggingFace)
Sistem melakukan hibridisasi antara pencarian terstruktur (SQL) dan pencarian semantik (Vector Search):
*   **Vector Search**: Menggunakan model embedding dari *Hugging Face Space* khusus untuk menerjemahkan `semantic_query` menjadi representasi matematis. Kemudian, vektor ini dibandingkan dengan vektor spesifikasi di dalam TiDB MySQL (`vec_cosine_distance`) untuk mencari kemiripan terdekat.
*   **Structured Filtering**: Hasil pencarian semantik akan difilter atau diurutkan ulang menggunakan klausa SQL absolut yang dihasilkan dari tahap 1 (seperti filter rentang harga, jumlah kursi, jenis bahan bakar, atau pengurutan efisiensi bbm).
*   **Fast-Path Bypassing**: Untuk pertanyaan kustomer yang murni analitikal (seperti "apa mobil toyota termurah/termahal?"), sistem dengan cerdas akan melewati (*bypass*) pencarian vektor dan langsung mengeksekusi kueri agregasi SQL untuk memberikan akurasi matematis absolut dengan latensi yang sangat rendah.

### 3. Tahap Generation (Gemini Sales Persona)
Konteks data spesifikasi, harga (OTR), dan metrik konsumsi bahan bakar yang telah berhasil ditarik dari database diumpankan (*prompt injected*) ke model Gemini. LLM ini telah diinstruksikan dengan persona "Sales Executive Auto2000" yang patuh pada aturan (Ground Truth):
*   Hanya menjawab berdasarkan konteks data yang diretriever.
*   Mampu melakukan *Cross-Selling* jika mobil yang dicari kustomer tidak tersedia atau melampaui budget, dengan cara mencocokkan kemiripan kriteria spesifikasi.

## 🏗️ Struktur Proyek & Tech Stack

*   **Frontend UI (`toyotarantauprapat/`)**: Dibangun dengan **Next.js 16 (App Router)**, Tailwind CSS, dan komponen interaktif untuk pengalaman obrolan responsif. Terdapat juga mekanisme konkurensi (Semaphore Lock) dipadukan dengan Upstash Redis untuk mengatur batasan pemanggilan API.
*   **Admin Data Management (`admin/`)**: Aplikasi **Python Flask** yang berfungsi untuk mengunggah dan mengekstrak data dari dokumen resmi (menggunakan `PyMuPDF`), membuat embedding, dan menyimpannya ke database.
*   **Evaluasi Kinerja (`eval/` & Root)**: Tersedia skrip pengujian beban (*load testing*) serta panduan lengkap melakukan evaluasi DeepEval di Kaggle (dengan metrik *Faithfulness*, *Answer Relevancy*, dan metrik *Contextual Retrieval*).

## 🚀 Rencana Pengembangan Lanjut (Roadmap)

Sistem Hybrid RAG ini akan terus dikembangkan dengan penambahan kapabilitas seperti:
1.  **Sistem Pembatasan Kuota (Anti-Bypass)**: Mekanisme proteksi limitasi penggunaan AI harian per pengguna berbasis alamat IP dan sidik jari peramban (*browser fingerprinting*).
2.  **Integrasi RAG Kalkulasi Pembiayaan**: Menyuntikkan rumus simulasi kredit Auto2000 ke dalam proses *Generation* LLM sehingga kustomer bisa langsung berdiskusi mengenai cicilan kredit.
3.  **Tautan Otomatis WhatsApp**: Tombol panggilan aksi (*Call-to-Action*) yang secara dinamis mengirimkan rekomendasi mobil hasil diskusi dari AI langsung ke nomor WhatsApp Sales Representatif (Manusia) secara mulus.
