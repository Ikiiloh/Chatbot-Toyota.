import React from "react";

function Hero() {
  return (
    <div className="flex flex-col items-center text-center px-4 max-w-3xl mx-auto pt-8 pb-4">

      {/* Main Title */}
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-foreground">
        Temukan Mobil Toyota{" "}
        <span className="bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent drop-shadow-sm">
          Ideal Anda
        </span>{" "}
        dengan AI
      </h1>

      {/* Subtitle */}
      <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
        Asisten digital kami siap mendengarkan kebutuhan spesifik Anda. 
        Tanya apa saja mulai dari rekomendasi mobil keluarga, SUV tangguh berfitur{" "}
        <span className="text-foreground font-semibold">TSS</span>, efisiensi bahan bakar hybrid, hingga unit komersial dengan penawaran harga{" "}
        <span className="text-foreground font-semibold">OTR Labuhanbatu</span>.
      </p>

      {/* Trust badging / specs bullet highlights */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-muted-foreground/80 font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Real-time Database TiDB</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Analisis Kriteria RAG</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Varian Hybrid & TSS Lengkap</span>
        </div>
      </div>
    </div>
  );
}

export default Hero;

