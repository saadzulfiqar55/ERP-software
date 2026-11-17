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
    <div className="relative h-40 w-full rounded-2xl bg-md-surface-container-low group-hover:bg-md-secondary-container/45 overflow-hidden flex flex-col justify-between transition-all duration-300 ease-out">
      {canEditImage && onImageUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ease-out"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center select-none">
          <div className="w-11 h-11 rounded-2xl bg-md-primary-container text-md-on-primary-container group-hover:scale-105 flex items-center justify-center mb-2 transition-transform duration-250 ease-out">
            <StationIcon className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-md-on-surface-variant">
            <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>Menu Image Placeholder</span>
          </div>
          <span className="text-[11px] text-md-on-surface-variant mt-0.5">
            {station.label}
          </span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="relative z-10 flex items-center justify-between p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-md-on-surface bg-md-surface-container-lowest/95 px-2.5 py-1 rounded-lg shadow-2xs">
            #{product.code}
          </span>
          {product.popular && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-md-primary-container text-md-on-primary-container">
              <Sparkles className="w-3 h-3" strokeWidth={1.8} /> Popular
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
            className="border-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-md-surface-container-lowest/95 hover:bg-md-primary text-md-on-surface hover:text-md-on-primary text-xs font-medium shadow-2xs transition-all duration-200"
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>{product.imageUrl ? "Change" : "Photo"}</span>
          </button>
        )}
      </div>

      {/* Bottom Overlay Badges */}
      <div className="relative z-10 flex items-center justify-between p-2.5">
        <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-md-secondary-container text-md-on-secondary-container">
          {product.segment === "RESTAURANT"
            ? station.label
            : `Stock: ${product.stockQty} ${product.unit}`}
        </span>
        <span className="text-xs font-medium px-2 py-1 rounded-lg bg-md-surface-container-lowest/95 text-md-on-surface-variant shadow-2xs">
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
