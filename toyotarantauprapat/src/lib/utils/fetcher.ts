import axios from "axios";
import { Mobil } from "../interfaces/mobil.interface";
import { layanan } from "../interfaces/data.interface";

export const idSpead = process.env.NEXT_PUBLIC_SPREAD_MOBIL_ID;

export const fetchMobil = async () => {
  if (!idSpead) {
    console.warn("NEXT_PUBLIC_SPREAD_MOBIL_ID belum diset. Data mobil tidak bisa dimuat.");
    return [];
  }
  try {
    const data = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=mobil`
    );
    return (
      data?.data.map((mobil: any) => ({
        ...mobil,
        kategori: mobil.kategori.split(",").map((t: string) => t.trim()), // Convert 'type' string to list
      })) || []
    );
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
};

export async function fetchMobilDetail(slug: string): Promise<Mobil | null> {
  if (!idSpead) return null;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=mobil&nama=${slug}`
    );
    return await response.data;
  } catch (error) {
    console.error("Error fetching mobil detail:", error);
    return null;
  }
}
export async function fetchDeskripsi(nama: string): Promise<Mobil | null> {
  if (!idSpead) return null;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=deskripsiMobil&nama=${nama}`
    );
    return await response.data;
  } catch (error) {
    console.error("Error fetching mobil detail:", error);
    return null;
  }
}

// promo
export async function fetchPromo() {
  if (!idSpead) return [];
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=promo`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching promo:", error);
    return [];
  }
}

export async function fetchPromoDetail(idPromo: any) {
  if (!idSpead) return null;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=promo&id_promo=${idPromo}`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching promo detail:", error);
    return null;
  }
}

//salesss
export async function fetchSales() {
  if (!idSpead) return [];
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=sales`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching sales:", error);
    return [];
  }
}

export async function fetchSalesDetail(idSales: any) {
  if (!idSpead) return null;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=sales&id_sales=${idSales}`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching sales detail:", error);
    return null;
  }
}

// layanan
export async function fetchLayanan() {
  if (!idSpead) return [] as unknown as layanan;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=layanan`
    );
    return response.data as layanan;
  } catch (error) {
    console.error("Error fetching layanan:", error);
    return [] as unknown as layanan;
  }
}

export async function fetchLayananDetail(idLayanan: string) {
  if (!idSpead) return null as unknown as layanan;
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=layanan&id_layanan=${idLayanan}&fields=title,gallery,desk_awal,deskripsi,point,keunggulan,kemudahan,langkah_langkah,link,`
    );
    return response.data as layanan;
  } catch (error) {
    console.error("Error fetching layanan detail:", error);
    return null as unknown as layanan;
  }
}

//gallery
export async function fetchGallery() {
  if (!idSpead) return [];
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=gallery`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching gallery:", error);
    return [];
  }
}

//review
export async function fetchReview() {
  if (!idSpead) return [];
  try {
    const response = await axios.get(
      `https://script.google.com/macros/s/${idSpead}/exec?action=review`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching review:", error);
    return [];
  }
}
