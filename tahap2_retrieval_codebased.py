import json

def evaluate_retrieval():
    print("Memulai Evaluasi Retrieval (Code-Based)...")
    
    # Load dataset evaluasi untuk mendapatkan expected_retrieval_context
    with open("dataset_evaluasi.json", "r", encoding="utf-8") as f:
        dataset = json.load(f)
        
    expected_contexts_map = {}
    for item in dataset:
        expected_contexts_map[item["input"]] = item.get("expected_retrieval_context", [])
        
    # Load hasil RAG pipeline
    try:
        with open("hasil_rag_pipeline.json", "r", encoding="utf-8") as f:
            rag_results = json.load(f)
    except FileNotFoundError:
        print("File hasil_rag_pipeline.json tidak ditemukan. Jalankan tahap1_rag_pipeline.py terlebih dahulu.")
        return
        
    total_queries = len(rag_results["hasil"])
    hits = 0
    sum_mrr = 0.0
    sum_recall = 0.0
    
    print(f"Mengevaluasi {total_queries} pertanyaan...\n")
    
    for item in rag_results["hasil"]:
        query = item["input"]
        retrieved_docs = item.get("retrieval_context", [])
        expected_substrings = expected_contexts_map.get(query, [])
        
        found_substrings = set()
        first_hit_rank = 0
        
        # Cari di seluruh retrieved_docs
        for rank, doc_text in enumerate(retrieved_docs, start=1):
            for expected in expected_substrings:
                if expected.lower() in doc_text.lower():
                    found_substrings.add(expected)
                    # Catat rank pertama kali kita menemukan SALAH SATU dokumen relevan (untuk MRR)
                    if first_hit_rank == 0:
                        first_hit_rank = rank
                        
        # Kalkulasi MRR dan Hit Rate (Hit = setidaknya 1 dokumen relevan ditemukan)
        if first_hit_rank > 0:
            hits += 1
            sum_mrr += (1.0 / first_hit_rank)
            status = f"HIT (Rank {first_hit_rank})"
        else:
            status = "MISS"
            
        # Kalkulasi Recall
        recall = 0.0
        if len(expected_substrings) > 0:
            recall = len(found_substrings) / len(expected_substrings)
        sum_recall += recall
            
        print(f"Q: {query}")
        print(f"Expected Contexts: {len(expected_substrings)} | Found: {len(found_substrings)}")
        print(f"Status: {status} | Recall: {recall:.2%}")
        print("-" * 20)
            
    hit_rate = hits / total_queries if total_queries > 0 else 0
    mrr = sum_mrr / total_queries if total_queries > 0 else 0
    avg_recall = sum_recall / total_queries if total_queries > 0 else 0
    
    print("\n" + "=" * 40)
    print("HASIL EVALUASI RETRIEVAL")
    print("=" * 40)
    print(f"Total Query : {total_queries}")
    print(f"Total Hit   : {hits}")
    print(f"Hit Rate    : {hit_rate:.2%}")
    print(f"MRR         : {mrr:.4f}")
    print(f"Recall      : {avg_recall:.2%}")
    print("=" * 40)
    
if __name__ == "__main__":
    evaluate_retrieval()
