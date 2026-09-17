import { StudioSessionProvider } from '@/features/converter/StudioSession';

import "./globals.css";
import { ToastContainer } from "react-toastify";
import { UserProvider } from "@/context/UserContext";




export const metadata = {
  title: "WordPress Converter Studio | Gutenberg & Elementor",
  description:
    "Convert static websites into Gutenberg or Elementor pages, with reusable headers, footers and dynamic menus.",
  icons: {
    icon: "/fav-logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning={true} data-lt-installed={true}>
      <body
        
      >
        <UserProvider><StudioSessionProvider>
          <ToastContainer
            position="top-right"
            autoClose={2000}
            hideProgressBar={true}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            style={{
              zIndex: 9999,
              marginBottom: "20px",
              top: "20px", // Push from top
              right: "40px", // Push from right
              width: "420px", // Fixed width for uniformity
              fontSize: "14px", // Clean font size
            }}
          />
          {children}
        </StudioSessionProvider></UserProvider>{" "}
      </body>
    </html>
  );
}
  