import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Navbar from "./components/Navbar";

export const metadata = {
  title: "Portfolio DApp",
  description: "Test portfolio blockchain app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="flex items-center justify-between p-4 border-b">
            <Navbar />
            <ConnectButton />
          </header>
          <main className="p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
