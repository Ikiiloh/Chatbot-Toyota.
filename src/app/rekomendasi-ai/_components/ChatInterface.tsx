"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import Hero from "./Hero";
import { useMobilStore } from "@/lib/store/useCarStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SendHorizonal,
  Bot,
  User,
  Sparkles,
  ChevronDown,
  Database,
  Car,
  CreditCard,
  Fuel,
  Shield,
  Users,
  RotateCcw,
  Scale,
  Eye,
  Check,
  X,
  Compass,
  Zap,
  Gauge
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  rewrittenQuery?: string;
}


interface CarDetail {
  name: string;
  price: string;
  bbmKota: string;
  bbmTol: string;
  transmission: string;
  fuelType: string;
  capacity: string;
  hasTSS: boolean;
  rawSpecs: any;
  image?: string | null;
}

const WELCOME_MESSAGE = `Selamat datang di **Layanan Konsultasi Digital Auto2000 Rantauprapat**! 🚗✨

Saya adalah asisten virtual berbasis kecerdasan buatan (AI) dan RAG (Retrieval-Augmented Generation). Saya siap membantu Bapak/Ibu menemukan unit Toyota terbaik dengan harga OTR Labuhanbatu secara cepat dan akurat.

Silakan ketik kriteria mobil idaman Anda di bawah ini, atau gunakan salah satu rekomendasi pencarian kami.`;

const SUGGESTION_CHIPS = [
  {
    icon: Users,
    text: "Mobil hybrid untuk keluarga",
  },
  {
    icon: Shield,
    text: "SUV tangguh dengan fitur TSS",
  },
  {
    icon: Car,
    text: "Mobil compact dengan transmisi CVT",
  },
  {
    icon: Fuel,
    text: "Pilihan mobil paling irit BBM",
  },
];

const RADAR_STATUSES = [
  "Menghubungkan ke kluster TiDB Cloud...",
  "Mengirimkan query hybrid vector search...",
  "Menghitung relevansi cosine distance...",
  "Memindai database unit Toyota Rantauprapat...",
  "Mengevaluasi spesifikasi & efisiensi bahan bakar...",
  "Memformulasikan penjelasan rekomendasi AI..."
];

// --- Custom SVGs representing car shapes ---
function CarSilhouette({ name, fuelType }: { name: string; fuelType: string }) {
  const nameLower = name.toLowerCase();

  // Commercial / Pickup
  if (nameLower.includes("hilux")) {
    return (
      <svg className="w-40 h-20 text-muted-foreground/30 dark:text-muted-foreground/20 group-hover:text-red-500/20 transition-colors duration-500" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 38 L10 26 L22 20 L58 18 L60 30 L92 30 L94 38 Z" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 20 L35 12 L52 12 L58 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="60" y1="30" x2="60" y2="24" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="26" cy="38" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <circle cx="74" cy="38" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
      </svg>
    );
  }

  // SUV
  if (nameLower.includes("fortuner") || nameLower.includes("land cruiser") || nameLower.includes("rush") || nameLower.includes("raize") || nameLower.includes("cross")) {
    return (
      <svg className="w-40 h-20 text-muted-foreground/30 dark:text-muted-foreground/20 group-hover:text-red-500/20 transition-colors duration-500" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 38 L10 26 L22 20 L55 18 L80 22 L90 28 L94 38 Z" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 20 L35 12 L68 12 L80 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="38" r="7" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <circle cx="74" cy="38" r="7" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <path d="M38 10 L64 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }

  // MPV
  if (nameLower.includes("innova") || nameLower.includes("zenix") || nameLower.includes("avanza") || nameLower.includes("veloz") || nameLower.includes("calya") || nameLower.includes("alphard") || nameLower.includes("vellfire")) {
    return (
      <svg className="w-40 h-20 text-muted-foreground/30 dark:text-muted-foreground/20 group-hover:text-red-500/20 transition-colors duration-500" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 38 L10 28 L28 17 L72 15 L88 24 L92 38 Z" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 17 L42 13 L70 13 L82 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="38" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <circle cx="72" cy="38" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
      </svg>
    );
  }

  // Sedan / Compact Hatchback (Agya, Yaris, Vios, Camry)
  return (
    <svg className="w-40 h-20 text-muted-foreground/30 dark:text-muted-foreground/20 group-hover:text-red-500/20 transition-colors duration-500" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 38 L15 30 L30 26 L55 22 L75 27 L88 32 L92 38 Z" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 26 L42 16 L65 16 L75 27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="38" r="6" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
      <circle cx="72" cy="38" r="6" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
    </svg>
  );
}

// --- Radar Scanning Animation ---
function RadarLoader() {
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % RADAR_STATUSES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 w-full bg-muted/20 border border-border/60 rounded-3xl backdrop-blur-sm shadow-inner relative overflow-hidden">
      <style jsx global>{`
        @keyframes radar-sweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes radar-ping {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes dot-flash {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .animate-radar-sweep {
          animation: radar-sweep 5s linear infinite;
        }
        .animate-radar-ping {
          animation: radar-ping 3s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
        }
        .animate-dot-flash {
          animation: dot-flash 2.5s ease-in-out infinite;
        }
      `}</style>

      {/* Visual Radar Circle */}
      <div className="relative w-48 h-48 rounded-full border border-red-500/20 flex items-center justify-center bg-black/5 dark:bg-white/5">
        {/* Pulsing rings */}
        <div className="absolute inset-0 rounded-full border border-red-500/10 scale-75" />
        <div className="absolute inset-0 rounded-full border border-red-500/15 scale-50" />
        <div className="absolute inset-0 rounded-full border border-red-500/20 scale-25" />
        <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-radar-ping" />
        <div className="absolute inset-0 rounded-full border-2 border-red-500/15 animate-radar-ping [animation-delay:1.5s]" />

        {/* Scanning Sweep Line */}
        <div className="absolute inset-0 rounded-full overflow-hidden animate-radar-sweep origin-center">
          <div className="w-1/2 h-1/2 bg-gradient-to-tr from-transparent to-red-500/30 border-r-2 border-red-500/60" style={{ transform: "rotate(45deg)", transformOrigin: "100% 100%" }} />
        </div>

        {/* Target Dots (Simulating car nodes matching kriteria) */}
        <div className="absolute top-1/4 left-1/3 w-2.5 h-2.5 bg-red-500 rounded-full animate-dot-flash shadow-lg shadow-red-500/50 [animation-delay:0.2s]" />
        <div className="absolute bottom-1/4 right-1/4 w-3 h-3 bg-red-500 rounded-full animate-dot-flash shadow-lg shadow-red-500/50 [animation-delay:0.7s]" />
        <div className="absolute top-1/2 right-1/3 w-2 h-2 bg-red-500 rounded-full animate-dot-flash shadow-lg shadow-red-500/50 [animation-delay:1.3s]" />
        <div className="absolute bottom-1/3 left-1/4 w-2 w-2 bg-teal-500 rounded-full animate-dot-flash shadow-lg shadow-teal-500/50 [animation-delay:1.9s]" />

        <div className="relative z-10 w-12 h-12 bg-card border border-red-500/40 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/10">
          <Compass className="w-6 h-6 text-red-600 animate-spin [animation-duration:10s]" />
        </div>
      </div>

      {/* Status descriptions */}
      <div className="mt-8 text-center space-y-2.5 max-w-sm relative z-10">
        <h4 className="text-sm font-bold text-foreground tracking-wide uppercase flex items-center justify-center gap-2">
          <Database className="w-4 h-4 text-red-500 animate-pulse" />
          Memindai Database Toyota
        </h4>
        <div className="h-5 flex items-center justify-center">
          <p className="text-xs text-muted-foreground animate-fade-in font-medium transition-all duration-300">
            {RADAR_STATUSES[statusIdx]}
          </p>
        </div>

        {/* Progress simulator bars */}
        <div className="w-44 h-1.5 bg-muted rounded-full mx-auto overflow-hidden border border-border/40">
          <div className="h-full bg-gradient-to-r from-red-600 to-rose-400 rounded-full animate-infinite-scroll w-1/2" style={{ animation: "radar-progress 2s cubic-bezier(0.4, 0, 0.2, 1) infinite" }} />
        </div>
      </div>

      <style jsx>{`
        @keyframes radar-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

// Helper function to match RAG recommended car names to Google Sheet data images
const matchCarImage = (recommendedName: string, storeCars: any[]): string | null => {
  if (!storeCars || storeCars.length === 0) return null;

  // Clean recommended name: remove "toyota", "all new", "new", "kijang" prefixes
  const cleanRec = recommendedName.toLowerCase()
    .replace(/^(toyota\s+)?(all\s+new\s+|new\s+)?(kijang\s+)?/i, "")
    .trim();

  // Match 1: Clean substring match (e.g. "avanza 1.3 e" contains "avanza" after removing hyphens)
  for (const car of storeCars) {
    if (!car.nama || !car.gambar) continue;

    // Clean store name: replace hyphens with spaces, remove "toyota" prefix
    const cleanStoreName = car.nama.toLowerCase()
      .replace(/-/g, " ")
      .replace(/^toyota\s+/i, "")
      .trim();

    if (cleanRec.includes(cleanStoreName) || cleanStoreName.includes(cleanRec)) {
      return car.gambar;
    }
  }

  // Match 2: Keyword match fallback (e.g., if there are minor mismatches)
  const recWords = cleanRec.split(/\s+/).filter((w: string) => w.length > 2);
  for (const car of storeCars) {
    if (!car.nama || !car.gambar) continue;

    const cleanStoreName = car.nama.toLowerCase().replace(/-/g, " ").replace(/^toyota\s+/i, "").trim();
    const storeWords = cleanStoreName.split(/\s+/).filter((w: string) => w.length > 2);

    const hasWordMatch = storeWords.some((word: string) => recWords.includes(word));
    if (hasWordMatch) {
      return car.gambar;
    }
  }

  return null;
};

// --- Main ChatInterface Component ---
export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showContext, setShowContext] = useState<string | null>(null);
  const [contextData, setContextData] = useState<Record<number, string>>({});

  // Custom interactive details states
  const [activeCarDetail, setActiveCarDetail] = useState<CarDetail | null>(null);
  const [compareList, setCompareList] = useState<CarDetail[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [topicStartIndex, setTopicStartIndex] = useState(1);
  const [respondedTopicMessages, setRespondedTopicMessages] = useState<Record<number, 'yes' | 'no'>>({});

  const handleTopicChoice = (idx: number, choice: 'yes' | 'no') => {
    setRespondedTopicMessages((prev) => ({
      ...prev,
      [idx]: choice,
    }));
    if (choice === 'no') {
      const newTopicIndex = messages.length + 1; // index untuk pesan user berikutnya setelah system notification dimasukkan
      setTopicStartIndex(newTopicIndex);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "✨ **Topik Baru Dimulai**\n\nPencarian sebelumnya telah diarsipkan dari memori. Silakan tanyakan kriteria atau unit Toyota lainnya tanpa terpengaruh konteks di atas."
        }
      ]);
    }
  };

  const { cars: storeCars, fetchCars } = useMobilStore();

  useEffect(() => {
    if (storeCars.length === 0) {
      fetchCars();
    }
  }, [storeCars, fetchCars]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isZeroState = messages.length <= 1;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
  }, [messages, isLoading]);

  // Handle auto-focus and text area height reset
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [isZeroState]);

  // Parse OTR context blocks into structured lists of Cars
  const parseContextCars = (contextStr: string): CarDetail[] => {
    if (!contextStr) return [];
    const cars: CarDetail[] = [];
    // Split on each database block starts
    const blocks = contextStr.split(/(?=\n-\s*MOBIL:|-\s*MOBIL:)/g);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const nameMatch = block.match(/(?:-\s*)?MOBIL:\s*([^\n]+)/);
      const priceMatch = block.match(/HARGA:\s*([^\n]+)/);
      const bbmKotaMatch = block.match(/KONSUMSI BBM \(DALAM KOTA\):\s*([^\n]+)/);
      const bbmTolMatch = block.match(/KONSUMSI BBM \(LUAR KOTA\/TOL\):\s*([^\n]+)/);
      const detailMatch = block.match(/DETAIL FITUR:\s*([^\n]+)/);

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const price = priceMatch ? priceMatch[1].trim() : "Hubungi Dealer";
        const bbmKota = bbmKotaMatch ? bbmKotaMatch[1].trim() : "";
        const bbmTol = bbmTolMatch ? bbmTolMatch[1].trim() : "";

        let rawSpecs: any = {};
        if (detailMatch) {
          try {
            rawSpecs = JSON.parse(detailMatch[1].trim());
          } catch {
            rawSpecs = {};
          }
        }

        // Extract Fuel/Propulsion Type
        let fuelType = "Bensin";
        const nameLower = name.toLowerCase();
        if (nameLower.includes("hybrid") || nameLower.includes("hev") || JSON.stringify(rawSpecs).toLowerCase().includes("hybrid") || JSON.stringify(rawSpecs).toLowerCase().includes("hev")) {
          fuelType = "Hybrid";
        } else if (nameLower.includes("ev") || nameLower.includes("bev") || nameLower.includes("electric") || JSON.stringify(rawSpecs).toLowerCase().includes("battery ev")) {
          fuelType = "Listrik";
        } else if (nameLower.includes("dsl") || nameLower.includes("diesel") || JSON.stringify(rawSpecs).toLowerCase().includes("diesel")) {
          fuelType = "Diesel";
        }

        // Extract transmission
        let transmission = "M/T";
        const specEngineLower = (rawSpecs.engine_transmission || "").toLowerCase();

        if (fuelType === "Listrik") {
          transmission = "-";
        } else if (nameLower.includes("e-cvt") || nameLower.includes("ecvt") || specEngineLower.includes("e-cvt") || specEngineLower.includes("ecvt")) {
          transmission = "e-CVT";
        } else if (nameLower.includes("cvt") || specEngineLower.includes("cvt")) {
          transmission = "CVT";
        } else if (nameLower.includes("a/t") || nameLower.includes("at") || nameLower.includes("automatic") || specEngineLower.includes("a/t") || specEngineLower.includes("at") || specEngineLower.includes("automatic")) {
          transmission = "A/T";
        } else if (nameLower.includes("m/t") || nameLower.includes("mt") || nameLower.includes("manual") || specEngineLower.includes("m/t") || specEngineLower.includes("mt") || specEngineLower.includes("manual")) {
          transmission = "M/T";
        }

        // Extract seating capacity
        let capacity = "5 Penumpang";
        const specStr = JSON.stringify(rawSpecs).toLowerCase();
        if (nameLower.includes("avanza") || nameLower.includes("veloz") || nameLower.includes("zenix") || nameLower.includes("innova") || nameLower.includes("calya") || nameLower.includes("alphard") || nameLower.includes("rush") || nameLower.includes("fortuner") || nameLower.includes("land cruiser")) {
          capacity = "7 Penumpang";
        } else if (specStr.includes("7 penumpang") || specStr.includes("7 orang") || specStr.includes("7-seater") || specStr.includes("7 seat")) {
          capacity = "7 Penumpang";
        } else if (specStr.includes("5 penumpang") || specStr.includes("5 orang") || specStr.includes("5-seater") || specStr.includes("5 seat")) {
          capacity = "5 Penumpang";
        } else if (nameLower.includes("rangga") && (nameLower.includes("cab-chs") || nameLower.includes("pu"))) {
          capacity = "2 Penumpang";
        }

        // Extract TSS (Toyota Safety Sense)
        let hasTSS = false;
        if (nameLower.includes("tss") || nameLower.includes("safety sense") || specStr.includes("tss") || specStr.includes("safety sense") || specStr.includes("collision") || specStr.includes("departure")) {
          hasTSS = true;
        }

        const matchedImg = matchCarImage(name, storeCars);

        cars.push({
          name,
          price,
          bbmKota,
          bbmTol,
          transmission,
          fuelType,
          capacity,
          hasTSS,
          rawSpecs,
          image: matchedImg
        });
      }
    }
    return cars;
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Mengatur status loading untuk memicu UI RadarLoader tanpa memblokir interaksi UI lainnya
    setIsLoading(true);

    try {
      const startIdx = Math.max(1, topicStartIndex);
      const chatHistory = newMessages
        .slice(startIdx)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          chatHistory: chatHistory.slice(-10),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error },
        ]);
      } else {
        const messageIndex = newMessages.length;
        if (data.context) {
          setContextData((prev) => ({
            ...prev,
            [messageIndex]: data.context,
          }));
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            rewrittenQuery: data.rewrittenQuery || undefined
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Terjadi kesalahan jaringan. Pastikan koneksi internet Anda stabil dan coba lagi.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
  };

  const resetChat = () => {
    setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
    setContextData({});
    setCompareList([]);
    setInput("");
    setTopicStartIndex(1);
    setRespondedTopicMessages({});
  };

  // Compare car management
  const toggleCompare = (car: CarDetail) => {
    setCompareList((prev) => {
      const exists = prev.find((item) => item.name === car.name);
      if (exists) {
        return prev.filter((item) => item.name !== car.name);
      } else {
        if (prev.length >= 3) {
          alert("Anda dapat membandingkan maksimal 3 mobil sekaligus.");
          return prev;
        }
        return [...prev, car];
      }
    });
  };

  const removeCompareCar = (name: string) => {
    setCompareList((prev) => prev.filter((car) => car.name !== name));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] w-full max-w-5xl mx-auto px-4 py-4 md:py-6 relative">
      {/* Header bar */}
      <div className="flex-shrink-0 flex items-center justify-between border-b pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-rose-700 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/10">
              <Bot className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background"></div>
          </div>
          <div>
            <h1 className="font-bold text-sm md:text-base tracking-tight text-foreground flex items-center gap-1.5">
              Toyota Smart Recommender
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500/20" />
              Gemini + TiDB Hybrid Search
            </p>
          </div>
        </div>

        {!isZeroState && (
          <Button
            onClick={resetChat}
            variant="outline"
            size="sm"
            className="rounded-xl border-border/80 text-xs font-semibold gap-1.5 hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Konsultasi Baru
          </Button>
        )}
      </div>

      {/* Dynamic Content View */}
      {isZeroState ? (
        /* Zero State / Landing View */
        <div className="flex-1 overflow-y-auto flex flex-col justify-start pt-8 md:pt-16 items-center max-w-4xl mx-auto w-full space-y-8 md:space-y-12 pb-8 animate-fade-in scrollbar-none">
          <Hero />

          {/* Large Search-bar Prompt Input */}
          <div className="w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-3xl p-2.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-red-500/20 focus-within:border-red-500/80 hover:border-border-foreground/20 backdrop-blur-md">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Ketik kriteria Anda di sini... (Contoh: 'Innova hybrid irit bbm di bawah 600 juta')"
                className="w-full bg-transparent border-0 resize-none outline-none focus:ring-0 text-sm md:text-base py-3 px-4 min-h-[64px] max-h-[150px] scrollbar-none placeholder:text-muted-foreground/60 text-foreground"
                disabled={isLoading}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="h-12 w-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/15 transition-all duration-300 hover:shadow-red-500/35 flex-shrink-0 flex items-center justify-center disabled:opacity-50"
                size="icon"
              >
                <SendHorizonal className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Suggested Prompts chips */}
          <div className="w-full max-w-2xl text-center">
            <h3 className="text-[10px] md:text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mb-4">
              Saran Pertanyaan Anda
            </h3>
            <div className="flex flex-wrap justify-center gap-2.5 px-2">
              {SUGGESTION_CHIPS.map((chip, chipIdx) => (
                <button
                  key={chipIdx}
                  onClick={() => sendMessage(chip.text)}
                  className="flex items-center gap-2.5 text-xs px-4.5 py-3 bg-card hover:bg-red-50 dark:hover:bg-red-950/10 border hover:border-red-300 dark:hover:border-red-900 rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md group text-left"
                >
                  <chip.icon className="w-4 h-4 text-red-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="text-muted-foreground group-hover:text-foreground font-semibold transition-colors">
                    {chip.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Chat Feed Active View */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Scrollable Message Box */}
          <div className="flex-1 overflow-y-auto px-1 py-4 space-y-6 scrollbar-thin scrollbar-thumb-muted">
            {messages.map((msg, idx) => {
              const cars = msg.role === "assistant" ? parseContextCars(contextData[idx] || "") : [];

              return (
                <div
                  key={idx}
                  className={`flex gap-3 md:gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"
                    } animate-fade-in`}
                >
                  {/* Assistant Icon */}
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-8.5 h-8.5 bg-gradient-to-br from-red-600 to-rose-700 rounded-xl flex items-center justify-center shadow-md shadow-red-600/5 mt-1">
                      <Bot className="w-4.5 h-4.5 text-white" />
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div
                    className={`max-w-[85%] md:max-w-[80%] flex flex-col space-y-4 ${msg.role === "user" ? "items-end" : "items-start"
                      }`}
                  >
                    {/* Text block */}
                    <div
                      className={`rounded-3xl px-5 py-4 shadow-sm border ${msg.role === "user"
                        ? "bg-red-600 border-red-700 text-white rounded-tr-md"
                        : "bg-card border-border/80 rounded-tl-md text-foreground"
                        }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 marker:text-red-500">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                      )}

                      {/* Debug contexts toggle */}
                      {msg.role === "assistant" && contextData[idx] && (
                        <div className="mt-4 pt-3 border-t border-border/50">
                          <button
                            onClick={() =>
                              setShowContext(
                                showContext === `ctx-${idx}` ? null : `ctx-${idx}`
                              )
                            }
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Database className="w-3.5 h-3.5 text-red-500" />
                            <span>Data Analisis RAG TiDB</span>
                            <ChevronDown
                              className={`w-3 h-3 transition-transform duration-300 ${showContext === `ctx-${idx}` ? "rotate-180" : ""
                                }`}
                            />
                          </button>
                          {showContext === `ctx-${idx}` && (
                            <pre className="mt-3 p-3 bg-muted rounded-xl text-[10px] font-mono overflow-x-auto border text-muted-foreground max-h-48 overflow-y-auto leading-relaxed shadow-inner">
                              {contextData[idx]}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Tampilkan kata kunci hasil query expansion */}
                      {msg.role === "assistant" && msg.rewrittenQuery && (
                        <div className="mt-2.5 px-3 py-2 bg-yellow-500/5 dark:bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-1.5 text-[11px] text-yellow-600 dark:text-yellow-400 font-medium">
                          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                          <span><strong>Kata Kunci AI RAG:</strong> <em>{msg.rewrittenQuery}</em></span>
                        </div>
                      )}
                    </div>

                    {/* Rendering Car Cards (Grid structure) if DB context returns cars */}
                    {msg.role === "assistant" && cars.length > 0 && (
                      <div className="w-full space-y-4 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {cars.map((car, carIdx) => {
                            const isComparing = compareList.some((item) => item.name === car.name);

                            return (
                              <div
                                key={carIdx}
                                className="group flex flex-col bg-card border border-border/85 rounded-2xl overflow-hidden hover:border-red-500/50 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300"
                              >
                                {/* Blueprint Header graphic */}
                                <div className="relative h-40 bg-gradient-to-br from-muted/50 to-muted/20 dark:from-neutral-900/60 dark:to-neutral-950/40 flex items-center justify-center overflow-hidden border-b border-border/50">
                                  <div className="absolute inset-0 bg-radial-gradient from-red-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                  {/* Render actual image if found, otherwise fallback to SVG silhouette */}
                                  {car.image ? (
                                    <img
                                      src={car.image}
                                      alt={car.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                  ) : (
                                    <CarSilhouette name={car.name} fuelType={car.fuelType} />
                                  )}

                                  {/* Badges */}
                                  <div className="absolute top-2.5 right-2.5 flex flex-wrap gap-1 items-end justify-end">
                                    {car.hasTSS && (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 text-[9px] font-bold tracking-wide uppercase shadow-sm">
                                        <Sparkles className="w-2.5 h-2.5 text-teal-500 animate-spin [animation-duration:5s]" />
                                        TSS
                                      </span>
                                    )}
                                    {car.fuelType === "Hybrid" && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-[9px] font-bold tracking-wide uppercase shadow-sm">
                                        HEV
                                      </span>
                                    )}
                                    {car.fuelType === "Listrik" && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[9px] font-bold tracking-wide uppercase shadow-sm">
                                        BEV
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Card details */}
                                <div className="p-4 flex-1 flex flex-col space-y-4">
                                  <div className="space-y-1">
                                    <h4 className="font-bold text-sm md:text-base text-foreground line-clamp-2 leading-tight group-hover:text-red-600 transition-colors">
                                      {car.name}
                                    </h4>
                                    <p className="text-xs md:text-sm font-bold text-red-600">
                                      {car.price}
                                    </p>
                                  </div>

                                  {/* Spec Bulletpoints */}
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-[11px] text-muted-foreground border-t border-b border-border/40 py-2.5 mt-auto">
                                    <div className="flex items-center gap-1.5">
                                      <Gauge className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                      <span className="truncate">
                                        {car.bbmKota ? `${car.bbmKota} km/l` : "Bensin"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                      <span className="truncate">{car.transmission}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 col-span-2">
                                      <Users className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                      <span>{car.capacity}</span>
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => setActiveCarDetail(car)}
                                      variant="outline"
                                      className="flex-1 h-8 text-xs font-semibold rounded-lg hover:bg-muted/80 flex items-center justify-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Detail
                                    </Button>
                                    <Button
                                      onClick={() => toggleCompare(car)}
                                      variant={isComparing ? "secondary" : "default"}
                                      className={`flex-1 h-8 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 ${isComparing
                                        ? "bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20"
                                        : "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                                        }`}
                                    >
                                      {isComparing ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" />
                                          Dipilih
                                        </>
                                      ) : (
                                        <>
                                          <Scale className="w-3.5 h-3.5" />
                                          Bandingkan
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Interactive confirmation prompt box */}
                        {!respondedTopicMessages[idx] && topicStartIndex <= idx + 1 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-muted/40 border border-border/60 rounded-2xl gap-3 animate-fade-in">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Apakah Bapak/Ibu ingin melanjutkan pencarian berdasarkan rekomendasi di atas?
                            </span>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleTopicChoice(idx, 'yes')}
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-bold rounded-lg border-border/80 text-muted-foreground hover:text-foreground"
                              >
                                Ya, Lanjutkan
                              </Button>
                              <Button
                                onClick={() => handleTopicChoice(idx, 'no')}
                                variant="default"
                                size="sm"
                                className="h-8 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white"
                              >
                                Tidak, Topik Baru
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User Icon bubble right aligned */}
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-8.5 h-8.5 bg-gradient-to-br from-neutral-600 to-neutral-800 rounded-xl flex items-center justify-center shadow-md mt-1">
                      <User className="w-4.5 h-4.5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* High-fidelity radar scanning loader */}
            {isLoading && (
              <div className="flex gap-3 md:gap-4 justify-start w-full animate-pulse">
                <div className="flex-shrink-0 w-8.5 h-8.5 bg-gradient-to-br from-red-600 to-rose-700 rounded-xl flex items-center justify-center shadow-md mt-1">
                  <Bot className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="w-full max-w-[85%] md:max-w-[80%]">
                  <RadarLoader />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Docked Sticky Bottom Input */}
          <div className="sticky bottom-0 bg-background/90 backdrop-blur-md border-t pt-4 pb-1">
            <div className="flex items-end gap-2 max-w-4xl mx-auto relative">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ketik kriteria/pertanyaan lanjutan Anda di sini..."
                  rows={1}
                  className="w-full resize-none rounded-2xl border border-border/80 bg-muted/40 px-4 py-3.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-muted-foreground/50 text-foreground"
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="h-11 w-11 rounded-2xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/15 hover:shadow-red-500/35 transition-all flex-shrink-0"
                size="icon"
              >
                <SendHorizonal className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/40 mt-3.5">
              Semua estimasi harga OTR Labuhanbatu. AI dapat membuat kesalahan.
            </p>
          </div>
        </div>
      )}

      {/* Floating Compare Drawer Bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md bg-card border border-border shadow-2xl rounded-2xl p-4 flex items-center justify-between gap-4 animate-bounce-short backdrop-blur-md">
          <style jsx>{`
            @keyframes bounce-short {
              0%, 100% { transform: translate(-50%, 0); }
              50% { transform: translate(-50%, -4px); }
            }
            .animate-bounce-short {
              animation: bounce-short 3s ease-in-out infinite;
            }
          `}</style>

          <div className="flex flex-col space-y-1">
            <p className="text-xs font-bold text-foreground">
              Bandingkan Mobil ({compareList.length}/3)
            </p>
            <div className="flex gap-1.5">
              {compareList.map((car, cIdx) => (
                <div key={cIdx} className="relative group/tag">
                  <span className="inline-flex text-[9px] bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-md max-w-[80px] truncate">
                    {car.name.replace(/Toyota|New|All/g, "").trim()}
                  </span>
                  <button
                    onClick={() => removeCompareCar(car.name)}
                    className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full bg-muted-foreground hover:bg-red-600 text-white flex items-center justify-center text-[8px] transition-colors"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setCompareList([])}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setIsCompareOpen(true)}
              className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/10"
            >
              Bandingkan ({compareList.length})
            </Button>
          </div>
        </div>
      )}

      {/* --- Dialogs/Modals for Interactive Specs --- */}

      {/* 1. Lihat Detail Modal */}
      <Dialog open={activeCarDetail !== null} onOpenChange={(open) => !open && setActiveCarDetail(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl">
          {activeCarDetail && (
            <>
              <DialogHeader className="border-b pb-4">
                <div className="flex flex-wrap gap-2 items-center mb-1">
                  {activeCarDetail.hasTSS && (
                    <span className="text-[10px] font-bold bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      TSS Active
                    </span>
                  )}
                  <span className="text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {activeCarDetail.fuelType}
                  </span>
                  <span className="text-[10px] font-bold bg-muted border text-muted-foreground px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {activeCarDetail.transmission}
                  </span>
                </div>
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground leading-tight">
                  {activeCarDetail.name}
                </DialogTitle>
                <DialogDescription className="text-sm font-semibold text-red-600 mt-1.5">
                  Estimasi Harga: {activeCarDetail.price}
                </DialogDescription>
              </DialogHeader>

              {/* Specifications Content Grid */}
              <div className="py-4 space-y-5">
                {/* Visual Blueprint illustration of detail */}
                <div className="h-32 bg-muted/30 dark:bg-neutral-900/40 rounded-xl border border-border/50 flex items-center justify-center relative overflow-hidden">
                  {activeCarDetail.image ? (
                    <img
                      src={activeCarDetail.image}
                      alt={activeCarDetail.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <CarSilhouette name={activeCarDetail.name} fuelType={activeCarDetail.fuelType} />
                      <div className="absolute inset-x-0 bottom-2 text-center text-[9px] text-muted-foreground/40 font-mono">
                        CHASSIS & ENGINE BLUEPRINT MODEL
                      </div>
                    </>
                  )}
                </div>

                {/* Database Specs Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Konsumsi BBM</span>
                    <div className="bg-muted/30 rounded-xl p-3 border border-border/40 text-xs font-semibold text-foreground space-y-1.5">
                      <div className="flex justify-between">
                        <span>Dalam Kota:</span>
                        <span className="text-red-600">{activeCarDetail.bbmKota ? `${activeCarDetail.bbmKota} km/l` : "Tidak Tercatat"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tol / Luar Kota:</span>
                        <span className="text-red-600">{activeCarDetail.bbmTol ? `${activeCarDetail.bbmTol} km/l` : "Tidak Tercatat"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Kapasitas Kabin</span>
                    <div className="bg-muted/30 rounded-xl p-3 border border-border/40 text-xs font-semibold text-foreground flex items-center justify-between h-[58px]">
                      <span>Seating Capacity:</span>
                      <span className="text-foreground">{activeCarDetail.capacity}</span>
                    </div>
                  </div>

                  {activeCarDetail.rawSpecs.engine_transmission && (
                    <div className="space-y-1 md:col-span-2">
                      <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Mesin & Transmisi</span>
                      <p className="bg-muted/30 rounded-xl p-3 border border-border/40 text-xs text-foreground font-medium leading-relaxed">
                        {activeCarDetail.rawSpecs.engine_transmission}
                      </p>
                    </div>
                  )}

                  {activeCarDetail.rawSpecs.safety && (
                    <div className="space-y-1 md:col-span-2">
                      <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Fitur Keselamatan</span>
                      <p className="bg-muted/30 rounded-xl p-3 border border-border/40 text-xs text-foreground font-medium leading-relaxed">
                        {activeCarDetail.rawSpecs.safety}
                      </p>
                    </div>
                  )}

                  {activeCarDetail.rawSpecs.comfort_convenience && (
                    <div className="space-y-1 md:col-span-2">
                      <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">Kenyamanan & Interior</span>
                      <p className="bg-muted/30 rounded-xl p-3 border border-border/40 text-xs text-foreground font-medium leading-relaxed">
                        {activeCarDetail.rawSpecs.comfort_convenience}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. Bandingkan Mobil Modal */}
      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Scale className="w-5.5 h-5.5 text-red-600" />
              Perbandingan Spesifikasi Toyota
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Membandingkan fitur, kapasitas, transmisi, harga OTR, dan keiritan bahan bakar unit pilihan Anda.
            </DialogDescription>
          </DialogHeader>

          {/* Comparison Table */}
          <div className="py-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-3 px-4 text-muted-foreground/80 font-bold uppercase tracking-wider w-1/4">Parameter</th>
                  {compareList.map((car, cIdx) => (
                    <th key={cIdx} className="py-3 px-4 font-bold text-foreground w-1/4">
                      {car.name}
                    </th>
                  ))}
                  {/* Fill empty cells if comparing less than 3 */}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <th key={idx} className="py-3 px-4 text-muted-foreground/30 font-medium italic w-1/4 border-l border-dashed border-border/40 text-center">
                      Kosong
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium text-foreground">
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Harga OTR</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 font-bold text-red-600 bg-red-500/5 dark:bg-red-500/5">
                      {car.price}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Jenis Penggerak</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-muted text-[10px] font-bold">
                        {car.fuelType}
                      </span>
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Transmisi</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4">
                      {car.transmission}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Kapasitas Kabin</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4">
                      {car.capacity}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">BBM Dalam Kota</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 text-teal-600 dark:text-teal-400 font-bold">
                      {car.bbmKota ? `${car.bbmKota} km/l` : "Tidak Tercatat"}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">BBM Tol / Luar Kota</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 text-teal-600 dark:text-teal-400 font-bold">
                      {car.bbmTol ? `${car.bbmTol} km/l` : "Tidak Tercatat"}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Keamanan TSS</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4">
                      {car.hasTSS ? (
                        <span className="text-green-600 font-bold flex items-center gap-1">
                          <Check className="w-4 h-4" /> Ada (Toyota Safety Sense)
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60 italic font-normal">Tidak Dilengkapi</span>
                      )}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Detail Mesin</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 max-w-[200px] truncate text-xs font-normal leading-relaxed text-muted-foreground" title={car.rawSpecs.engine_transmission}>
                      {car.rawSpecs.engine_transmission || "-"}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-muted-foreground/60 uppercase text-[10px] tracking-wider">Fitur Lainnya</td>
                  {compareList.map((car, cIdx) => (
                    <td key={cIdx} className="py-3 px-4 max-w-[200px] truncate text-xs font-normal leading-relaxed text-muted-foreground" title={car.rawSpecs.safety}>
                      {car.rawSpecs.safety || "-"}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
                    <td key={idx} className="py-3 px-4 border-l border-dashed border-border/40" />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
