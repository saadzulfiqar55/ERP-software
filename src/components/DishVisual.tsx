"use client";

import React, { useRef } from "react";
import { Product } from "@/lib/types";
import {
  Camera,
  Coffee,
  Croissant,
  Flame,
  Gift,
  ImageIcon,
  Soup,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

interface DishVisualProps {
  product: Product;
  canEditImage?: boolean;
  onImageUpload?: (productId: string, base64OrUrl: string) => void;
}

export default function DishVisual({
  product,
  canEditImage = false,
  onImageUpload,
}: DishVisualProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getStationMeta = () => {
    switch (product.kitchenStation) {
      case "KARAHI_HANDI":
        return { label: "Karahi & Handi", Icon: Soup };
      case "BBQ_GRILL":
        return { label: "Charcoal BBQ", Icon: Flame };
      case "RICE_PULAO":
        return { label: "Pulao & Rice", Icon: UtensilsCrossed };
      case "TANDOOR":
        return { label: "Live Tandoor", Icon: Croissant };
      case "SWEET_RETAIL":
        return { label: "Retail & Sweets", Icon: Gift };
      default:
        return { label: "Beverages", Icon: Coffee };
    }
  };

  const station = getStationMeta();
  const StationIcon = station.Icon;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImageUpload(product.id, reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative h-40 w-full rounded-xl bg-[#edf2f4] group-hover:bg-[#e4ebf0] border border-[#d4dce4] group-hover:border-[#ef233c]/30 overflow-hidden flex flex-col justify-between transition-all duration-300 ease-out cursor-pointer">
      {canEditImage && onImageUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {/* Actual Menu Image OR Interactive Placeholder */}
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center select-none">
          <div className="w-12 h-12 rounded-xl bg-white group-hover:bg-[#ef233c] border border-[#d4dce4] group-hover:border-[#ef233c] flex items-center justify-center text-[#ef233c] group-hover:text-white mb-2 shadow-xs group-hover:shadow-md transition-all duration-300 ease-out">
            <StationIcon className="w-5 h-5 transition-colors duration-300" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4a4e69] group-hover:text-[#2b2d42] transition-colors duration-300">
            <ImageIcon className="w-3.5 h-3.5 text-[#8d99ae] group-hover:text-[#ef233c] transition-colors duration-300" />
            <span>Menu Image Placeholder</span>
          </div>
          <span className="text-[11px] text-[#8d99ae] group-hover:text-[#4a4e69] mt-0.5 transition-colors duration-300">
            {station.label}
          </span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="relative z-10 flex items-center justify-between p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-[#2b2d42] bg-white/95 group-hover:bg-[#2b2d42] group-hover:text-white px-2.5 py-1 rounded-md border border-[#d4dce4] group-hover:border-[#2b2d42] shadow-2xs transition-colors duration-300">
            #{product.code}
          </span>
          {product.popular && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-[#ef233c] text-white shadow-2xs">
              <Sparkles className="w-3 h-3" /> Popular
            </span>
          )}
        </div>

        {canEditImage && onImageUpload && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            title="Upload Menu Item Photo"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 hover:bg-[#ef233c] text-[#2b2d42] hover:text-white border border-[#d4dce4] hover:border-[#ef233c] text-xs font-semibold shadow-2xs transition-all duration-200 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{product.imageUrl ? "Change" : "Add Photo"}</span>
          </button>
        )}
      </div>

      {/* Bottom Overlay Badges */}
      <div className="relative z-10 flex items-center justify-between p-2.5 bg-gradient-to-t from-[#2b2d42]/80 via-[#2b2d42]/30 to-transparent">
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#2b2d42] group-hover:bg-[#ef233c] text-white transition-colors duration-300">
          {product.segment === "RESTAURANT"
            ? station.label
            : `Stock: ${product.stockQty} ${product.unit}`}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/95 text-[#2b2d42]">
          {product.taxMode === "INCLUSIVE"
            ? "GST Incl."
            : product.taxMode === "EXEMPT"
            ? "Exempt"
            : "+PRA GST"}
        </span>
      </div>
    </div>
  );
}
