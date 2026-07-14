import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mysql from "mysql2/promise";
import { Redis } from "@upstash/redis";

// --- In-Memory Fallback Semaphore: Membatasi concurrent request ke Gemini ---
class MemorySemaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private maxConcurrent: number) { }

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }

  get status() {
    return { running: this.running, queued: this.queue.length };
  }
}

const localSemaphore = new MemorySemaphore(10);

// --- Upstash Redis Client Initialization ---
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const isRedisEnabled = !!(redisUrl && redisToken);

let redis: Redis | null = null;
if (isRedisEnabled) {
  redis = new Redis({
    url: redisUrl!,
    token: redisToken!,
  });
  console.log("[Redis] Upstash Redis enabled and initialized.");
} else {
  console.log("[Redis] Upstash credentials missing. Falling back to Local In-Memory Queue (Semaphore).");
}

// --- Helper Functions (ported from prototype's app.py) ---

interface SelfQuery {
  semantic_query: string;
  exact_keywords: string[];
  exclude_keywords: string[];
  budget_min: number | null;
  budget_max: number | null;
  price_sort: "termurah" | "termahal" | "keduanya" | null;
  is_hybrid: boolean | null;
  seats: number | null;
  is_fuel_efficient: boolean;
  is_listing: boolean;
}

// --- Cache untuk daftar nama model dari database ---
let cachedModelAliases: string[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

// Prefix umum Toyota yang perlu dihapus untuk membuat alias pendek
const STRIP_PREFIXES = /^(toyota\s+)?(all\s+new\s+|new\s+)?(kijang\s+)?/i;

/**
 * Dari nama lengkap di DB (misal "Toyota New Kijang Innova Zenix Hybrid EV"),
 * buat alias-alias pendek yang sesuai dengan cara user mengetik:
 *   - "innova zenix hybrid ev" (stripped — otomatis ditambahkan)
 *   - "innova zenix hybrid" (sub-phrase)
 *   - "innova zenix" (sub-phrase)
 * 
 * Single-word model (misal "Hilux", "Agya") otomatis masuk via aliases.add(stripped).
 * Sub-phrases minimal 2 kata agar "hilux" tidak ikut muncul dari "hilux rangga".
 */
function generateAliases(fullName: string): string[] {
  const stripped = fullName.replace(STRIP_PREFIXES, "").trim();
  if (!stripped) return [fullName];

  const aliases = new Set<string>();
  aliases.add(fullName); // nama lengkap tetap disimpan
  aliases.add(stripped); // nama tanpa prefix (juga menangani single-word model)

  const words = stripped.split(/\s+/);

  // Jika kata pertama bukan kata tunggal yang dilarang/ambigu, tambahkan sebagai alias
  if (words[0]) {
    const firstWordLower = words[0].toLowerCase();
    const blacklistedSingleWords = ["hilux", "gr", "ev", "hev"];
    if (firstWordLower.length > 2 && !blacklistedSingleWords.includes(firstWordLower)) {
      aliases.add(words[0]);
    }
  }

  // Buat sub-phrases progresif (dari panjang ke pendek, minimal 2 kata)
  // agar "hilux" TIDAK di-generate dari "hilux rangga"
  for (let len = words.length; len >= 2; len--) {
    aliases.add(words.slice(0, len).join(" "));
  }

  return Array.from(aliases);
}

async function fetchModelNames(): Promise<string[]> {
  const now = Date.now();
  if (cachedModelAliases.length > 0 && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedModelAliases;
  }

  let koneksi;
  try {
    koneksi = await getDbConnection();
    const [rows] = await koneksi.execute(
      "SELECT DISTINCT tipe_mobil FROM data_mobil_hybrid"
    );
    const rawModels = (rows as any[])
      .map((r: any) => r.tipe_mobil?.trim().toLowerCase())
      .filter(Boolean);

    // Generate aliases untuk setiap model
    const allAliases = new Set<string>();
    for (const model of rawModels) {
      for (const alias of generateAliases(model)) {
        allAliases.add(alias);
      }
    }

    cachedModelAliases = Array.from(allAliases);
    cacheTimestamp = now;
    console.log(`[Cache] ${rawModels.length} models → ${cachedModelAliases.length} aliases`);
    return cachedModelAliases;
  } catch (error) {
    console.error("Error fetching model names:", error);
    return cachedModelAliases; // Return stale cache jika ada
  } finally {
    if (koneksi) await koneksi.end();
  }
}

function buildModelRegex(modelNames: string[]): RegExp {
  if (modelNames.length === 0) return /(?!)/gi; // Tidak pernah match

  // Sort by length descending agar nama panjang match duluan
  // misal: "innova zenix hybrid ev" harus match sebelum "innova zenix"
  const sorted = [...modelNames].sort((a, b) => b.length - a.length);

  // Escape karakter regex dan ganti spasi dengan \s+
  const patterns = sorted.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
  );

  // Gunakan \b di awal dan akhir grup agar pencocokan nama model bersifat utuh (word boundary)
  return new RegExp(`\\b(?:${patterns.join("|")})\\b`, "gi");
}

function getSpecificModels(teks: string, modelNames: string[]): string[] {
  const modelRegex = buildModelRegex(modelNames);

  const matches = [...teks.matchAll(modelRegex)].map((m) =>
    m[0].toLowerCase().replace(/\s+/g, " ").trim()
  );
  if (matches.length === 0) return [];
  // Return unique matches
  return Array.from(new Set(matches));
}

function parseQueryModels(teks: string, modelNames: string[]): { included: string[], excluded: string[] } {
  const parts = teks.split(/(?:selain|kecuali|exclude)/i);
  if (parts.length < 2) {
    return {
      included: getSpecificModels(teks, modelNames),
      excluded: []
    };
  }
  return {
    included: getSpecificModels(parts[0], modelNames),
    excluded: getSpecificModels(parts.slice(1).join(" "), modelNames)
  };
}

// --- Get TiDB Connection ---
async function getDbConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_NAME,
    port: parseInt(process.env.TIDB_PORT || "4000"),
    ssl: {
      rejectUnauthorized: true,
    },
  });
}

// --- Get HuggingFace Embedding ---
async function getHuggingFaceEmbedding(
  text: string
): Promise<number[] | null> {
  try {
    const spaceUrl =
      process.env.HUGGINGFACE_SPACE_URL || "https://ikiiloh-rag-car.hf.space";

    // Gradio v6+ uses /gradio_api prefix instead of /api
    // on_click expects inputs: [text, state] per Gradio config
    const response = await fetch(`${spaceUrl}/gradio_api/call/on_click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [text, null],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`HuggingFace call failed: ${response.status} ${response.statusText}`, errBody);
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const callData = await response.json();
    const eventId = callData.event_id;
    console.log(`[HF] Event ID: ${eventId}`);

    // Fetch SSE result stream
    const resultResponse = await fetch(
      `${spaceUrl}/gradio_api/call/on_click/${eventId}`,
      {
        signal: AbortSignal.timeout(120000),
      }
    );

    if (!resultResponse.ok) {
      throw new Error(`HuggingFace result fetch error: ${resultResponse.status}`);
    }

    const resultText = await resultResponse.text();
    // Parse SSE format - Gradio v6 returns data in SSE stream
    const lines = resultText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const jsonData = JSON.parse(line.substring(6));
          if (Array.isArray(jsonData)) {
            // Response is [dense_vector, quota_markdown, explanation_markdown]
            const vector = Array.isArray(jsonData[0]) ? jsonData[0] : jsonData;
            console.log(`[HF] Embedding received, length: ${vector.length}`);
            return vector;
          }
        } catch (parseErr) {
          console.error("[HF] Failed to parse SSE data line:", line.substring(0, 100));
        }
      }
    }

    console.error("[HF] No valid embedding found in SSE response");
    return null;
  } catch (error) {
    console.error("Error getting HuggingFace embedding:", error);
    return null;
  }
}

// --- Query Expansion / Query Rewriting
async function rewriteQueryForRAG(message: string, chatHistory: { role: string; content: string }[]): Promise<SelfQuery> {
  const apiKey = process.env.GOOGLE_API_KEY_RAG || process.env.GOOGLE_API_KEY;
  const defaultFallback: SelfQuery = { semantic_query: message, exact_keywords: [], exclude_keywords: [], budget_min: null, budget_max: null, price_sort: null, is_hybrid: null, seats: null, is_fuel_efficient: false, is_listing: false };
  if (!apiKey) return defaultFallback;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    let historyContext = "";
    if (chatHistory && chatHistory.length > 0) {
      // Ambil maksimal 6 pesan terakhir untuk menghemat token dan fokus pada konteks terdekat
      const recentHistory = chatHistory.slice(-6);
      historyContext = "RIWAYAT PERCAKAPAN TERBARU:\n" + recentHistory.map(h => `${h.role === 'user' ? 'Kustomer' : 'Sales Executive'}: "${h.content}"`).join("\n") + "\n\n";
    }

    const systemInstruction = `
      Anda adalah AI Self-Querying Retriever untuk sistem rekomendasi mobil Toyota Auto2000.
      Tugas Anda adalah membedah (parsing) pesan kustomer menjadi objek JSON terstruktur.
      Gunakan RIWAYAT PERCAKAPAN TERBARU sebagai konteks jika kustomer menggunakan kata ganti ("selain itu", "yang termurah").
      
      ATURAN EKSTRAKSI JSON:
      - "semantic_query": Tulis ulang pertanyaan menjadi kata kunci pencarian teknis otomotif (string). JANGAN masukkan harga atau syarat mutlak di sini.
      - "exact_keywords": Array of strings. Jika kustomer meminta fitur HARGA MATI, masukkan sinonimnya ke sini. 
         Contoh: jika minta "sunroof" atau "atap kaca", masukkan ["sunroof", "moonroof", "panoramic roof"]. Jika minta "captain seat", masukkan ["captain seat"]. DILARANG memasukkan nama model mobil ke sini.
      - "exclude_keywords": Array of strings. Jika kustomer minta "TIDAK MAU X" atau "SELAIN X".
      - "budget_min": Angka murni (number) batas BAWAH harga dalam Rupiah. Jika kustomer bilang "di atas 200 juta", isi 200000000. Jika tidak ada batas bawah, isi null.
      - "budget_max": Angka murni (number) batas ATAS harga dalam Rupiah. Jika kustomer bilang "di bawah 300 juta" atau "budget 300 juta", isi 300000000. Jika tidak ada batas atas, isi null.
      - CATATAN KHUSUS: Jika kustomer bilang "200 jutaan", artinya budget_min = 200000000 dan budget_max = 299999999.
      - "price_sort": Pilih "termurah" (minta harga terendah), "termahal" (minta tertinggi), "keduanya" (HANYA JIKA kustomer meminta rentang harga termurah sekaligus termahal, misal: "range harga avanza?"), atau null (jika hanya membandingkan 2 hal).
      - "is_hybrid": true (hanya mau hybrid/EV), false (hanya mau bensin murni), atau null (bebas).
      - "seats": 5, 7, 16 (untuk minibus), atau null.
      - "is_fuel_efficient": true (jika mencari mobil irit bbm/hemat/efisien), false jika tidak.
      - "is_listing": true (jika kustomer meminta "apa saja", "daftar", "tampilkan semua"), false jika tidak.

      GLOSARIUM ISTILAH OTOMOTIF UNTUK SEMANTIC QUERY:
      - "CAB-CHS" / "Cab & Chassis" = mobil sasis kosong tanpa bak belakang, siap dipasang bodi karoseri (boks, ambulans, toko keliling, dll).
      - "CAB" / "Kabin" = bagian depan mobil (ruang kemudi sopir dan penumpang).
      - "CHASSIS" / "Sasis" = rangka utama mobil beserta roda dan mesin.
      - "PU" / "Pick Up" = sasis untuk modifikasi angkutan barang.
      - "MB" / "Microbus" / "Motorized Business" / "Mobile Business" = sasis untuk modifikasi angkutan penumpang atau model komersial bergerak.
      - "DSL" = mesin Diesel. Varian tanpa "DSL" berarti Bensin.
      - "PICK UP" (tanpa CAB-CHS) = mobil sudah utuh lengkap dengan bak belakang bawaan pabrik.
      - Jika kustomer menanyakan istilah-istilah di atas, tulis ulang semantic_query menggunakan sinonim yang lebih kaya agar pencarian vektor lebih akurat (misal: "cab chassis sasis kosong karoseri boks komersial").
    `;

    const promptText = `${historyContext}Pertanyaan Kustomer Terbaru: "${message}"`;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      systemInstruction: { role: "user", parts: [{ text: systemInstruction }] },
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 500,
        responseMimeType: "application/json" 
      },
    });

    const rewrittenStr = result.response.text().trim();
    console.log(`[RAG Self-Query] Result:`, rewrittenStr);
    const selfQuery: SelfQuery = JSON.parse(rewrittenStr);
    
    // Fallback normalization
    selfQuery.semantic_query = selfQuery.semantic_query || message;
    selfQuery.exact_keywords = selfQuery.exact_keywords || [];
    selfQuery.exclude_keywords = selfQuery.exclude_keywords || [];
    selfQuery.budget_min = selfQuery.budget_min || null;
    selfQuery.budget_max = selfQuery.budget_max || null;
    
    return selfQuery;
  } catch (err) {
    console.error("[RAG Self-Query] Error, falling back to default:", err);
    return defaultFallback;
  }
}

async function cariKonteksHybrid(
  selfQuery: SelfQuery,
  originalMessage: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<string> {
  const budgetMin = selfQuery.budget_min;
  const budgetMax = selfQuery.budget_max;
  const queryIrit = selfQuery.is_fuel_efficient;
  const queryHarga = selfQuery.price_sort;
  const hybridFilter = selfQuery.is_hybrid;
  const queryListing = selfQuery.is_listing;
  const seaterFilter = selfQuery.seats;
  const expandedQuery = selfQuery.semantic_query;

  // Ambil daftar model dari database (dengan cache 1 jam)
  const modelNames = await fetchModelNames();

  // Deteksi apakah user menanyakan model mobil spesifik (dari pesan asli + query perluasan)
  const textForModelDetect = originalMessage + " " + expandedQuery;
  const { included: models, excluded } = parseQueryModels(textForModelDetect, modelNames);
  const isSpecificModel = models.length > 0;

  let modelFilter = "";
  if (isSpecificModel) {
    const conditions = models.map((m) => `LOWER(tipe_mobil) LIKE '%${m}%'`).join(" OR ");
    modelFilter = ` AND (${conditions})`;
  }

  // Build model exclusion clause
  let excludeFilter = "";
  const allExcludes = [...new Set([...excluded, ...(selfQuery.exclude_keywords || [])])];
  if (allExcludes.length > 0) {
    const conditions = allExcludes.map((m) => `(LOWER(tipe_mobil) NOT LIKE '%${m}%' AND LOWER(spesifikasi_detail) NOT LIKE '%${m}%')`).join(" AND ");
    excludeFilter = ` AND (${conditions})`;
  }

  // Build hybrid filter clause
  let hybridClause = "";
  if (hybridFilter === false) {
    hybridClause = " AND (LOWER(varian) NOT LIKE '%hybrid%' AND LOWER(varian) NOT LIKE '%hev%' AND LOWER(varian) NOT LIKE '%ev%' AND LOWER(tipe_mobil) NOT LIKE '%hybrid%' AND LOWER(tipe_mobil) NOT LIKE '%hev%' AND LOWER(tipe_mobil) NOT LIKE '%ev%')";
  } else if (hybridFilter === true) {
    hybridClause = " AND (LOWER(varian) LIKE '%hybrid%' OR LOWER(varian) LIKE '%hev%' OR LOWER(varian) LIKE '%ev%' OR LOWER(tipe_mobil) LIKE '%hybrid%' OR LOWER(tipe_mobil) LIKE '%hev%' OR LOWER(tipe_mobil) LIKE '%ev%')";
  }

  // Build seater filter clause
  let seaterClause = "";
  if (seaterFilter === 7) {
    seaterClause = " AND (spesifikasi_detail LIKE '%7 orang%' OR spesifikasi_detail LIKE '%7 penumpang%' OR spesifikasi_detail LIKE '%8 penumpang%' OR spesifikasi_detail LIKE '%7-seater%' OR spesifikasi_detail LIKE '%7 seater%' OR spesifikasi_detail LIKE '%7 seat%' OR spesifikasi_detail LIKE '%7-seat%' OR spesifikasi_detail LIKE '%7 hingga 8 penumpang%' OR spesifikasi_detail LIKE '%7-8 penumpang%' OR spesifikasi_detail LIKE '%7 s/d 8 penumpang%')";
  } else if (seaterFilter === 5) {
    seaterClause = " AND (spesifikasi_detail LIKE '%5 orang%' OR spesifikasi_detail LIKE '%5 penumpang%' OR spesifikasi_detail LIKE '%5-seater%' OR spesifikasi_detail LIKE '%5 seater%' OR spesifikasi_detail LIKE '%5 seat%' OR spesifikasi_detail LIKE '%5-seat%')";
  } else if (seaterFilter === 16) {
    seaterClause = " AND (spesifikasi_detail LIKE '%16 orang%' OR spesifikasi_detail LIKE '%microbus%' OR spesifikasi_detail LIKE '%mikrobus%' OR tipe_mobil LIKE '%Hiace%')";
  }

  // Build exact keywords filter clause
  let keywordClause = "";
  if (selfQuery.exact_keywords && selfQuery.exact_keywords.length > 0) {
    // Gabungkan keyword yang berupa sinonim dengan OR, tapi antar kriteria dengan AND.
    // Karena kita tidak tahu mana sinonim mana bukan, kita asumsikan semua di dalam array adalah fitur yang bisa jadi sinonim satu sama lain ATAU berdiri sendiri.
    // Pendekatan lebih baik: LLM mengisi fitur dengan OR jika sinonim. Tapi format JSON flat array [fitur1, fitur2] berarti AND.
    const kwConditions = selfQuery.exact_keywords.map((kw) => `LOWER(spesifikasi_detail) LIKE '%${kw.toLowerCase()}%'`).join(" OR ");
    keywordClause = ` AND (${kwConditions})`;
  }

  // Build budget filter clause
  let budgetClause = "";
  const budgetParams: number[] = [];
  if (budgetMin !== null) {
    budgetClause += " AND harga >= ?";
    budgetParams.push(budgetMin);
  }
  if (budgetMax !== null) {
    budgetClause += " AND harga <= ?";
    budgetParams.push(budgetMax);
  }

  const additionalFilters = `${modelFilter}${excludeFilter}${hybridClause}${seaterClause}${keywordClause}${budgetClause}`;

  // --- FAST PATH: Jika user bertanya termurah/termahal, bypass vector search ---
  if (queryHarga) {
    console.log(`[RAG Price Compare] Detected: "${queryHarga}" with filters: "${additionalFilters}" — bypassing vector search`);
    let koneksiHarga: mysql.Connection | undefined;
    try {
      koneksiHarga = await getDbConnection();
      
      const runPriceQuery = async (filters: string, bParams: any[]) => {
        let sql = '';
        if (isSpecificModel) {
          if (queryHarga === 'keduanya') {
            sql = `
              (SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid WHERE 1=1 ${filters} ORDER BY harga ASC LIMIT 1)
              UNION ALL
              (SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid WHERE 1=1 ${filters} ORDER BY harga DESC LIMIT 1)
            `;
          } else if (queryHarga === 'termurah') {
            sql = `SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid WHERE 1=1 ${filters} ORDER BY harga ASC LIMIT 5`;
          } else {
            sql = `SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid WHERE 1=1 ${filters} ORDER BY harga DESC LIMIT 5`;
          }
          const [rows] = await koneksiHarga!.execute(sql, bParams);
          return rows as any[];
        } else {
          if (queryHarga === 'keduanya') {
            sql = `
              (SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid
               WHERE harga = (SELECT MIN(h2.harga) FROM data_mobil_hybrid h2 WHERE h2.tipe_mobil = data_mobil_hybrid.tipe_mobil) ${filters}
               ORDER BY harga ASC LIMIT 3)
              UNION ALL
              (SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid
               WHERE harga = (SELECT MAX(h2.harga) FROM data_mobil_hybrid h2 WHERE h2.tipe_mobil = data_mobil_hybrid.tipe_mobil) ${filters}
               ORDER BY harga DESC LIMIT 3)
            `;
          } else if (queryHarga === 'termurah') {
            sql = `
              SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid
              WHERE harga = (SELECT MIN(h2.harga) FROM data_mobil_hybrid h2 WHERE h2.tipe_mobil = data_mobil_hybrid.tipe_mobil) ${filters}
              ORDER BY harga ASC LIMIT 5
            `;
          } else {
            sql = `
              SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak FROM data_mobil_hybrid
              WHERE harga = (SELECT MAX(h2.harga) FROM data_mobil_hybrid h2 WHERE h2.tipe_mobil = data_mobil_hybrid.tipe_mobil) ${filters}
              ORDER BY harga DESC LIMIT 5
            `;
          }
          // The subquery trick requires params twice (one for MIN, one for MAX) if it's 'keduanya', 
          // but actually our filters don't contain parameters inside the MIN() subquery itself.
          // Wait, additionalFilters comes AFTER the subquery.
          const finalParams = queryHarga === 'keduanya' ? [...bParams, ...bParams] : bParams;
          const [rows] = await koneksiHarga!.execute(sql, finalParams);
          return rows as any[];
        }
      };

      let hasil = await runPriceQuery(additionalFilters, budgetParams);

      // Fallback Upselling: Jika kustomer punya budget ketat namun tidak ada mobil dengan fitur yang diminta
      if (hasil.length === 0 && (budgetMin !== null || budgetMax !== null)) {
        console.log("[RAG Price Compare] Fallback Upselling triggered. Removing budget constraints.");
        const fallbackFilters = `${modelFilter}${excludeFilter}${hybridClause}${seaterClause}${keywordClause}`;
        hasil = await runPriceQuery(fallbackFilters, []);
      }

      console.log("[RAG DATABASE RESULTS COUNT]", hasil.length);
      console.log("[RAG DATABASE RESULTS]", hasil.map(h => `${h.tipe_mobil} ${h.varian} — Rp ${Number(h.harga).toLocaleString('id-ID')}`));

      // Build context string
      let konteks = "";
      for (const row of hasil) {
        const hargaRaw = parseFloat(row.harga);
        const hargaFormatted = new Intl.NumberFormat("id-ID").format(hargaRaw);
        konteks += `\n- MOBIL: ${row.tipe_mobil} ${row.varian}\n`;
        konteks += `  HARGA: Rp ${hargaFormatted} (OTR Labuhanbatu)\n`;
        konteks += `  KONSUMSI BBM (DALAM KOTA): ${row.bbm_kota} km/l\n`;
        konteks += `  KONSUMSI BBM (LUAR KOTA/TOL): ${row.bbm_tol} km/l\n`;

        let specText = row.spesifikasi_detail;
        if (typeof row.spesifikasi_detail === 'object' && row.spesifikasi_detail !== null) {
          specText = JSON.stringify(row.spesifikasi_detail);
        }
        konteks += `  DETAIL FITUR: ${specText}\n`;
      }
      return konteks;
    } catch (error) {
      console.error("[RAG Price Compare] Database error:", error);
      return "";
    } finally {
      if (koneksiHarga) await koneksiHarga.end();
    }
  }

  // --- NORMAL PATH: Vector similarity search ---
  console.log(
    `[DEBUG] Irit: ${queryIrit}, BudgetMin: ${budgetMin}, BudgetMax: ${budgetMax}, Specific Model: ${isSpecificModel}, HybridFilter: ${hybridFilter}, Listing: ${queryListing}`
  );

  // Get embedding vector from HuggingFace (menggunakan expandedQuery untuk akurasi semantik)
  const vektor = await getHuggingFaceEmbedding(expandedQuery);
  if (!vektor) {
    console.error("Error mendapatkan embedding dari Hugging Face");
    return "";
  }

  const vektorStr = JSON.stringify(vektor);
  let koneksi;

  try {
    koneksi = await getDbConnection();
    let hasil: any[] = [];

    console.log("[RAG SPECIFIC MODELS DETECTED]", models);
    console.log("[RAG WHERE CLAUSES]", { additionalFilters, isSpecificModel });

    // Jika mencari model spesifik ATAU user meminta listing, bebaskan filter rn agar seluruh varian bisa diambil.
    const filterRn = (isSpecificModel || queryListing) ? "" : "WHERE rn = 1";
    const limitQuery = (isSpecificModel || queryListing) ? (isSpecificModel ? "LIMIT 30" : "LIMIT 15") : "LIMIT 7";

    const orderClause = queryIrit
      ? "bbm_kota DESC, jarak ASC"
      : "jarak ASC"; // Biarkan vector search bekerja sepenuhnya

    const rnOrder = queryIrit
      ? "bbm_kota DESC"
      : "vec_cosine_distance(embedding, ?)";

    const sql = `
      SELECT tipe_mobil, varian, harga, spesifikasi_detail, jarak, bbm_kota, bbm_tol FROM (
        SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol,
               vec_cosine_distance(embedding, ?) AS jarak,
               ROW_NUMBER() OVER (PARTITION BY tipe_mobil ORDER BY ${rnOrder}) AS rn
        FROM data_mobil_hybrid
        WHERE 1=1 ${additionalFilters}
      ) ranked
      ${filterRn}
      ORDER BY ${orderClause}
      ${limitQuery}
    `;

    const params: any[] = [vektorStr];
    if (!queryIrit) {
      params.push(vektorStr);
    }
    params.push(...budgetParams);

    const [rows] = await koneksi.execute(sql, params);
    hasil = rows as any[];

    // Fallback: if budget too low, find closest price matches
    if (hasil.length === 0 && budgetMax !== null && budgetMax < 250000000) {
      const fallbackSql = `SELECT tipe_mobil, varian, harga, spesifikasi_detail, bbm_kota, bbm_tol, 0 as jarak 
         FROM data_mobil_hybrid 
         WHERE 1=1 ${modelFilter}${excludeFilter}${hybridClause}${seaterClause}${keywordClause}
         ORDER BY ABS(harga - ?) ASC LIMIT 3`;
      const [fallbackRows] = await koneksi.execute(fallbackSql, [budgetMax]);
      hasil = fallbackRows as any[];
    }

    // Build context string
    let konteks = "";
    for (const row of hasil) {
      const hargaRaw = parseFloat(row.harga);
      const hargaFormatted = new Intl.NumberFormat("id-ID").format(hargaRaw);
      konteks += `\n- MOBIL: ${row.tipe_mobil} ${row.varian}\n`;
      konteks += `  HARGA: Rp ${hargaFormatted} (OTR Labuhanbatu)\n`;
      konteks += `  KONSUMSI BBM (DALAM KOTA): ${row.bbm_kota} km/l\n`;
      konteks += `  KONSUMSI BBM (LUAR KOTA/TOL): ${row.bbm_tol} km/l\n`;

      let specText = row.spesifikasi_detail;
      if (typeof row.spesifikasi_detail === 'object' && row.spesifikasi_detail !== null) {
        specText = JSON.stringify(row.spesifikasi_detail);
      }

      konteks += `  DETAIL FITUR: ${specText}\n`;
      if (row.jarak !== undefined) {
        konteks += `  (Relevansi: ${parseFloat(row.jarak).toFixed(4)})\n`;
      }
    }

    console.log("[RAG DATABASE RESULTS COUNT]", hasil.length);
    console.log("[RAG DATABASE RESULTS]", hasil.map(h => `${h.tipe_mobil} ${h.varian}`));
    return konteks;
  } catch (error) {
    console.error("Database error:", error);
    return "";
  } finally {
    if (koneksi) {
      await koneksi.end();
    }
  }
}

// --- Generate Gemini Response ---
async function tanyaGemini(
  pertanyaan: string,
  konteksDb: string,
  chatHistory: { role: string; content: string }[]
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const systemPrompt = `
    Anda adalah Sales Executive profesional, ramah, dan solutif dari Auto2000 Rantauprapat. 
    Tugas Anda adalah melayani kustomer yang bertanya mengenai lini mobil terbaru Toyota.

    INFORMASI PENTING UNTUK ANDA:
    1. Semua mobil dalam database adalah unit terbaru Toyota.
    2. Harga yang tertera merupakan harga On The Road (OTR) untuk wilayah Labuhanbatu, kecuali yang "segmentation" nya bertuliskan "Estimasi OTR Jakarta".
    3. Sumber data utama Anda adalah <data_database> di bawah ini.

    <data_database>
    ${konteksDb}
    </data_database>
    
    PEDOMAN GAYA BAHASA & LOGIKA JAWABAN:
    1. PERSONA SALES: Gunakan bahasa yang sopan, hangat (misal menyapa dengan 'Bapak/Ibu'), dan profesional. Jelaskan fitur secara menyeluruh namun sederhana agar kustomer tidak bingung.
    2. VALIDASI DATA & PENGETAHUAN UMUM TEKNOLOGI: Jawab kustomer berdasarkan data yang ada di <data_database>. Anda DILARANG KERAS memberikan informasi harga, varian, atau spesifikasi teknis dari mobil apapun (termasuk unit Toyota seperti Rush, Avanza, dll) jika data mobil tersebut tidak ada/kosong di dalam <data_database> yang Anda terima. Jika data unit tersebut tidak ada di <data_database>, katakan dengan jujur bahwa data harga dan unit tersebut belum tersedia di database resmi kami saat ini, alih-alih menebak harganya dari memori Anda. Namun, jika kustomer menanyakan nama teknologi otomotif, fitur keselamatan khusus (seperti sensor ngantuk/EDSS, radar, TSS, airbag, dll), atau istilah teknis yang penjelasannya tidak ada/minim di database, Anda diperbolehkan menggunakan pengetahuan umum Anda untuk menjelaskan cara kerja teknologi tersebut terlebih dahulu. Setelah itu, Anda wajib mereferensikan mobil di <data_database> yang memiliki sistem keselamatan tersebut (contoh: fitur Emergency Driving Stop System/EDSS adalah bagian dari paket Toyota Safety Sense/TSS, yang ada pada unit seperti Corolla Cross, Innova Zenix, Yaris Cross, Veloz TSS, dan Prius).
    3. LOGIKA REKOMENDASI (CROSS-SELLING): Jika kustomer mencari mobil tertentu yang TIDAK ADA di database, jangan langsung menolak. Lihat kriteria mereka (misal: mencari mobil keluarga, atau mobil irit). Cari mobil lain di <data_database> yang memiliki kemiripan kriteria, lalu berikan rekomendasi dengan kalimat: "Mohon maaf, unit [Mobil A] belum tersedia di data kami, namun berdasarkan keinginan Bapak/Ibu yang mencari mobil [Kriteria], saya sangat merekomendasikan [Mobil B] karena..."
    4. HARGA: Selalu informasikan bahwa harga tersebut adalah harga OTR Labuhanbatu untuk membantu kustomer menghitung budget mereka.
    5. STRUKTUR: Gunakan bullet points atau penomoran agar penjelasan fitur mudah dipahami.
    6. LOGIKA KEIRITAN (SANGAT PENTING - GROUND TRUTH): 
       a) Gunakan field "KONSUMSI BBM (DALAM KOTA)" dan "KONSUMSI BBM (LUAR KOTA/TOL)" di atas sebagai acuan utama Anda.
       b) Bandingkan angka tersebut secara matematis. Semakin tinggi angkanya, semakin irit mobil tersebut.
       c) Prioritaskan mobil dengan angka tertinggi saat kustomer bertanya tentang "paling irit" atau "hemat bbm".
       d) Abaikan bahasa marketing jika bertentangan dengan angka bbm yang tertera.
    7. PERINGATAN HARGA: Jika kustomer mencari harga yang JAUH di bawah unit termurah yang tersedia (misal cari 100jt tapi unit termurah 170jt), sampaikan dengan jujur bahwa unit di range 100jt pas belum tersedia, namun tawarkan unit terdekat (seperti Calya) sambil menyebutkan selisih harganya agar kustomer tidak kaget.
    8. RENTANG HARGA & VARIAN (SANGAT PENTING): Jika kustomer bertanya secara umum tentang suatu model mobil (contoh: "Berapa harga Avanza?", "Tanya Innova Zenix dong"), Anda WAJIB memberikan informasi rentang harga berdasarkan <data_database>. Sebutkan tipe terendah/termurahnya beserta harganya, dan tipe tertinggi/termahalnya beserta harganya. (Misal: "Harga Toyota Avanza OTR Labuhanbatu dibanderol mulai dari Rp X untuk tipe [Tipe A], hingga tipe tertingginya yaitu [Tipe B] di kisaran Rp Y").
    9. PERBANDINGAN HARGA: Jika kustomer mencari mobil 'termurah' atau 'termahal', Anda WAJIB membandingkan harga semua unit yang ada di <data_database> secara matematis sebelum memberikan jawaban agar tidak salah merekomendasikan.
    10. FORMAT OUTPUT: Gunakan format Markdown (seperti **teks tebal** untuk nama mobil dan harga) agar tampilan di website terlihat rapi dan profesional.
    11. BATASAN TOPIK (OUT-OF-SCOPE): Jika kustomer bertanya tentang merek selain Toyota (misal: Honda, Mitsubishi, dll) atau membandingkan mobil Toyota dengan kompetitor, Anda wajib:
        a) Tolak perbandingan tersebut dengan sopan, nyatakan bahwa Anda hanya melayani informasi resmi untuk unit Toyota Auto2000 Rantauprapat.
        b) DILARANG KERAS memberikan estimasi harga, spesifikasi, atau varian untuk mobil Toyota maupun kompetitor (karena data database kosong/RAG di-bypass). JANGAN menyebutkan nominal harga tebakan dari memori Anda.
        c) JANGAN PERNAH mengatakan "data Toyota Rush tidak ada di database kami" atau kalimat serupa yang mengesankan database Anda tidak lengkap. Cukup sebutkan alternatif nama model SUV/MPV Toyota yang sekelas (misal: Toyota Rush, Raize, Veloz) dan undang kustomer untuk menanyakan model Toyota tersebut secara spesifik agar Anda dapat membantu mencarikan data OTR resminya.
    12. PENAMAAN VARIAN HILUX RANGGA: Varian Toyota Hilux Rangga memiliki kode khusus: 
        - "CAB-CHS" (Cab & Chassis) berarti mobil sasis kosong tanpa bak belakang, sangat cocok untuk kustomer UMKM yang ingin mengkustomisasi/membuat bak belakangnya menjadi macam-macam bentuk karoseri (boks, dll). 
        - "PU" pada CAB-CHS berarti sasis untuk modifikasi angkutan barang, sedangkan "MB" (Microbus / Motorized Business / Mobile Business) untuk modifikasi angkutan penumpang atau model komersial bergerak, seperti toko keliling, ambulans, atau mobil boks.
        - CAB (Kabin): Bagian depan mobil yang berisi ruang kemudi untuk sopir dan penumpang.
        - CHASSIS (Sasis): Rangka utama mobil beserta roda dan mesin yang menjadi pondasi kendaraan.
        - Istilah CAB-CHASSIS MB 2.0 STD merujuk pada jenis mobil komersial yang dijual dalam bentuk sasis tanpa bak belakang yang siap dipasang berbagai jenis bodi oleh perusahaan karoseri.
        - "PICK UP" (tanpa CAB-CHS) berarti mobil sudah utuh lengkap dengan bak belakang bawaan pabrik. 
        - "DSL" berarti mesin Diesel, varian angka (seperti 2.0) tanpa DSL berarti Bensin. 
        Gunakan panduan ini untuk merekomendasikan tipe yang paling tepat (terutama tipe CAB-CHS).
    13. PROMO & KREDIT: DILARANG menawarkan program kredit, DP, atau diskon KECUALI pengguna secara spesifik menanyakannya.
    14. LAYANAN PURNAJUAL (AFTERSALES): Asisten digital ini HANYA melayani informasi penjualan unit mobil baru. Jika kustomer bertanya tentang biaya servis berkala, ganti oli, suku cadang, atau layanan bengkel lainnya, tolak dengan sopan. Jelaskan bahwa Anda tidak memiliki akses ke pangkalan data biaya mekanik/bengkel dan arahkan kustomer untuk berinteraksi langsung dengan Service Advisor di bengkel resmi Auto2000 Rantauprapat.
    15. FITUR PANORAMIC: Hati-hati dengan kata "Panoramic". Jika kustomer secara spesifik mencari mobil dengan "Panoramic Sunroof", "Sunroof", atau "Moonroof" (atap kaca), Anda DILARANG KERAS merekomendasikan mobil yang hanya memiliki "Panoramic View Monitor" atau PVM (fitur kamera 360 derajat). Pastikan mobil yang Anda rekomendasikan benar-benar tertulis memiliki fitur sunroof/moonroof/panoramic roof di bagian spesifikasinya.
    16. GARANSI & T-CARE: 
        - Garansi General (Semua Mobil): Meliputi kerusakan akibat cacat produksi pada mesin, transmisi, kelistrikan bodi, dan cat selama 3 tahun atau 100.000 km.
        - Program T-Care: Gratis Biaya Jasa Servis & Suku Cadang sampai servis berkala ke-7 (maksimal 3 tahun / 60.000 km) dan bonus perpanjangan garansi (Extended Warranty) 1 tahun / 20.000 km (total 4 tahun/120.000 km) jika rutin servis setiap 6 bulan di bengkel resmi.
        - Mobil Hybrid & EV (Double Protection): Mendapat Garansi General ditambah Garansi Khusus Baterai & Sistem Elektrifikasi (meliputi Hybrid Battery Pack, Inverter, Battery Control Module, Main Battery Pack, thermal management) selama 8 tahun atau 160.000 km. Semua garansi ini sudah include otomatis tanpa biaya tambahan.
  `;

  // Murni stateless (tanpa ingatan chatHistory) untuk menghemat limit token secara maksimal.
  // Tiap pesan akan dianggap sebagai percakapan baru.
  const contents = [
    {
      role: "user",
      parts: [{ text: pertanyaan }],
    }
  ];

  const maxRetry = 5;
  for (let attempt = 0; attempt < maxRetry; attempt++) {
    try {
      const result = await model.generateContent({
        contents,
        systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.2 },
      });

      return result.response.text();
    } catch (error: any) {
      if (error?.status === 429 || error?.message?.includes("RESOURCE_EXHAUSTED")) {
        const waitTime = Math.min(2 ** attempt * 5, 60) * 1000;
        if (attempt < maxRetry - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }
      if (error?.message?.includes("DEADLINE_EXCEEDED")) {
        const waitTime = 2 ** attempt * 1000;
        if (attempt < maxRetry - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }
      throw error;
    }
  }

  throw new Error("Max retries exceeded");
}

// --- API Route Handler ---
export async function POST(req: Request) {
  try {
    const { message, chatHistory = [] } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Pesan tidak boleh kosong." },
        { status: 400 }
      );
    }

    // --- STEP 1: Jalankan Self-Query (JSON) ---
    const selfQuery = await rewriteQueryForRAG(message, chatHistory);
    
    // --- STEP 2: RAG Context Retrieval ---
    const konteks = await cariKonteksHybrid(selfQuery, message, chatHistory);

    // --- STEP 3: Distributed Concurrency Lock (Semaphore) ---
    let usingLocalQueue = true;

    let jawaban = "";
    let redisSuccess = false;

    if (isRedisEnabled && redis) {
      try {
        const concurrencyKey = "toyota:queue:gemini_concurrency";
        const maxConcurrent = 10;
        const pollIntervalMs = 1000;
        const maxWaitTimeMs = 15000; // Tunggu maks 15 detik
        let waitedTime = 0;
        let acquired = false;

        while (waitedTime < maxWaitTimeMs) {
          // Atomic increment untuk melihat berapa request yang sedang running
          const activeCount = await redis.incr(concurrencyKey);

          if (activeCount <= maxConcurrent) {
            acquired = true;
            console.log(`[Redis Lock] Acquired. Active requests: ${activeCount}`);
            break;
          }

          // Jika melebihi limit, langsung decrement kembali dan tunggu
          await redis.decr(concurrencyKey);

          console.log(`[Redis Lock] Gemini busy (active count: ${activeCount}). Waiting ${pollIntervalMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          waitedTime += pollIntervalMs;
        }

        if (!acquired) {
          console.warn(`[Redis Lock] Wait timeout. Queue busy.`);
          return NextResponse.json(
            {
              error:
                "⚠️ Mohon maaf, server AI sedang melayani banyak kustomer. Silakan tunggu beberapa detik dan coba lagi.",
            },
            { status: 429 }
          );
        }

        // Jalankan Gemini & pastikan decrement dilakukan di block finally
        try {
          jawaban = await tanyaGemini(message, konteks, chatHistory);
          redisSuccess = true;
        } finally {
          const afterCount = await redis.decr(concurrencyKey);
          console.log(`[Redis Lock] Released. Active requests remaining: ${afterCount}`);
        }
      } catch (redisError) {
        console.error("[Redis Fallback Alert] Upstash Redis mengalami gangguan. Mengalihkan secara otomatis ke Local Semaphore...", redisError);
        redisSuccess = false; // Menandai gagal agar diteruskan ke blok local semaphore di bawah
      }
    }

    if (!redisSuccess) {
      // Fallback ke Local In-Memory Queue (Semaphore)
      const queueStatus = localSemaphore.status;
      if (queueStatus.queued > 0) {
        console.log(`[Local Queue] Request queued. Running: ${queueStatus.running}, Queued: ${queueStatus.queued}`);
      }

      await localSemaphore.acquire();
      try {
        jawaban = await tanyaGemini(message, konteks, chatHistory);
      } finally {
        localSemaphore.release();
      }
    }

    const debugInfo = [];
    if (selfQuery.semantic_query) debugInfo.push(`Semantik: "${selfQuery.semantic_query}"`);
    if (selfQuery.exact_keywords && selfQuery.exact_keywords.length > 0) debugInfo.push(`Wajib: [${selfQuery.exact_keywords.join(', ')}]`);
    if (selfQuery.exclude_keywords && selfQuery.exclude_keywords.length > 0) debugInfo.push(`Kecuali: [${selfQuery.exclude_keywords.join(', ')}]`);
    let budgetStr = "";
    if (selfQuery.budget_min && selfQuery.budget_max) {
      budgetStr = `Rp${selfQuery.budget_min.toLocaleString('id-ID')} - Rp${selfQuery.budget_max.toLocaleString('id-ID')}`;
    } else if (selfQuery.budget_min) {
      budgetStr = `> Rp${selfQuery.budget_min.toLocaleString('id-ID')}`;
    } else if (selfQuery.budget_max) {
      budgetStr = `< Rp${selfQuery.budget_max.toLocaleString('id-ID')}`;
    }

    if (budgetStr) debugInfo.push(`Budget: ${budgetStr}`);
    if (selfQuery.seats) debugInfo.push(`Kursi: ${selfQuery.seats}`);
    if (selfQuery.is_hybrid !== null) debugInfo.push(`Mesin: ${selfQuery.is_hybrid ? 'Hybrid/EV' : 'Bensin'}`);
    if (selfQuery.price_sort) debugInfo.push(`Sort: ${selfQuery.price_sort}`);
    if (selfQuery.is_fuel_efficient) debugInfo.push(`Irit: Ya`);

    const rewrittenStr = debugInfo.join(' | ');

    return NextResponse.json({
      response: jawaban,
      context: konteks,
      rewrittenQuery: rewrittenStr || undefined,
    });

  } catch (error: any) {
    console.error("AI Chat API error:", error);

    if (error?.status === 429 || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json(
        {
          error:
            "⚠️ Mohon maaf, kuota API sedang penuh. Silakan tunggu 1-2 menit lalu coba lagi.",
        },
        { status: 429 }
      );
    }

    if (error?.message?.includes("DEADLINE_EXCEEDED")) {
      return NextResponse.json(
        {
          error:
            "⏳ Mohon maaf, server AI sedang sibuk. Silakan coba kirim pertanyaan sekali lagi.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error:
          "⚠️ Terjadi kesalahan pada sistem. Silakan coba lagi nanti.",
      },
      { status: 500 }
    );
  }
}

