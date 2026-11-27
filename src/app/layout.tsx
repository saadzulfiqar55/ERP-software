import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StackLyra ERP — Material 3 Enterprise Resource Planning & POS",
  description:
    "Google Material Design 3 (Material You) ERP, Invoicing, Khata Accounting, Inventory & PRA POS built with Next.js App Router, TypeScript & PostgreSQL.",
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
      className={`${roboto.variable} ${robotoMono.variable}`}
    >
      <head>
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
