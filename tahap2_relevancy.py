
import json
import os
import time
import sys
import asyncio
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv


from deepeval.test_case import LLMTestCase
from deepeval.metrics import ContextualRelevancyMetric
from deepeval.models.base_model import DeepEvalBaseLLM

# =====================================================================
# SETUP
# =====================================================================
load_dotenv()
MODEL_JUDGE = "qwen2.5:3b"
API_KEY_JUDGE = "ollama"
INPUT_FILE = "hasil_rag_pipeline.json"
JEDA = 30  # 30 detik antar evaluasi

from openai import OpenAI, AsyncOpenAI

class OllamaJudge(DeepEvalBaseLLM):
    def __init__(self, model_name):
        self.model_name = model_name
        self.client = OpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
        self.async_client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )

    def load_model(self):
        return self.client

    def set_api_key(self, api_key):
        pass

    def generate(self, prompt: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.01,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Error Ollama: {e}. Pastikan aplikasi Ollama sedang berjalan!")
            return ""

    async def a_generate(self, prompt: str) -> str:
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.01,
            )
            return response.choices[0].message.content
        except Exception as e:
            return ""

    def get_model_name(self):
        return self.model_name

def main():
    print("=" * 60)
    print("TAHAP 2: EVALUASI DEEPEVAL")
    print(f"  Metrik      : Contextual Relevancy")
    print(f"  LLM Judge   : Ollama Lokal ({MODEL_JUDGE})")
    print(f"  API Key Env : Lokal (Ollama)")
    print("=" * 60)

    if not os.path.exists(INPUT_FILE):
        print(f"\nERROR: File '{INPUT_FILE}' tidak ditemukan!")
        sys.exit(1)

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data_rag = json.load(f)

    hasil_list = data_rag["hasil"]

    if not hasil_list:
        sys.exit(1)

    test_cases = []
    for h in hasil_list:
        tc = LLMTestCase(
            input=h["input"],
            actual_output=h["actual_output"],
            expected_output=h["expected_output"],
            retrieval_context=h["retrieval_context"],
        )
        test_cases.append(tc)

    judge = OllamaJudge(model_name=MODEL_JUDGE)
    judge.set_api_key("ollama")

    try:
        test_resp = judge.generate("Jawab satu kata: ibukota Indonesia?")
    except Exception as e:
        print(f"GAGAL KONEKSI: {e}")
        sys.exit(1)

    metrik_daftar = [
        ("Contextual Relevancy", "RETRIEVAL", ContextualRelevancyMetric(threshold=0.5, model=judge, include_reason=True, async_mode=False)),
    ]

    skor_per_metrik = {n: [] for n, _, _ in metrik_daftar}
    alasan_per_metrik = {n: [] for n, _, _ in metrik_daftar}
    total = len(test_cases)
    cnt = 0

    print("\n------------------------------------------------------------")
    for nama, sisi, metrik in metrik_daftar:
        print(f"\n[{sisi}] {nama}")

        for i, tc in enumerate(test_cases):
            # Fitur Gonta-Ganti Kunci untuk Relevancy (Selang-seling)
            current_api_key = API_KEYS_RELEVANCY[i % len(API_KEYS_RELEVANCY)]
            if current_api_key:
                judge.set_api_key("ollama")
            
            key_masked = current_api_key[:15] + "..." if current_api_key else "N/A"
            print(f"\n  [Info] Memakai Kunci Relevancy {i%2 + 1}: {key_masked}")

            cnt += 1
            q = tc.input[:45]
            print(f"  [{cnt}/{total}] \"{q}...\"", end=" ")

            try:
                metrik.measure(tc)
                skor = metrik.score
                alasan = metrik.reason if hasattr(metrik, 'reason') else ""
                skor_per_metrik[nama].append(skor)
                alasan_per_metrik[nama].append(alasan)
                st = "LULUS" if skor >= 0.5 else "GAGAL"
                print(f">> {skor:.4f} ({st})")
            except Exception as e:
                print(f">> ERROR: {str(e)[:60]}")
                skor_per_metrik[nama].append(None)
                alasan_per_metrik[nama].append(str(e)[:100])

            if cnt < total:
                time.sleep(JEDA)

    laporan = {
        "waktu_evaluasi": datetime.now().isoformat(),
        "model_judge": f"Ollama Lokal ({MODEL_JUDGE})",
        "model_rag": data_rag.get("model_rag", "N/A"),
        "jumlah_test_case": len(test_cases),
        "skor_rata_rata": {},
        "detail_skor": {}, "detail_alasan": {},
        "detail_per_test_case": hasil_list,
    }
    for n, _, _ in metrik_daftar:
        v = [x for x in skor_per_metrik[n] if x is not None]
        if v: laporan["skor_rata_rata"][n] = round(sum(v)/len(v), 4)
        laporan["detail_skor"][n] = skor_per_metrik[n]
        laporan["detail_alasan"][n] = alasan_per_metrik[n]

    out = f"hasil_evaluasi_ContextualRelevancyMetric_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(laporan, f, ensure_ascii=False, indent=2)

    print(f"\nHasil disimpan ke: {out}")
    print("=" * 60)

if __name__ == "__main__":
    main()
