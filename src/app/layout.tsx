import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StackLyra ERP — Material 3 Expressive Cloud ERP & POS",
  description:
    "Multi-Tenant SaaS Cloud ERP, POS, Invoicing, Khata Accounting & Inventory powered by Material 3 Expressive, Next.js & Supabase PostgreSQL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="theme-color" content="#0e1b3d" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="albarka-theme";var p=localStorage.getItem(k)||"light";var t=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):(p==="dark"?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-md-surface text-md-on-surface font-sans antialiased selection:bg-md-primary selection:text-md-on-primary">
        {children}
      </body>
    </html>
  );
}
