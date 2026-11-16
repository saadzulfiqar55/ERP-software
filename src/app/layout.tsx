import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Albarka POS — Restaurant & Retail ERP",
  description:
    "Modern Hybrid Point of Sale for Albarka Restaurant & Retail Counter with PRA e-IMS Integration, Khata Ledger, and Role-Based Access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#edf2f4] text-[#2b2d42] selection:bg-[#ef233c] selection:text-white">
        {children}
      </body>
    </html>
  );
}
