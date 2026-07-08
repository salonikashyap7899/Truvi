import { motion } from "framer-motion";

/**
 * Floating WhatsApp contact button — replaces the old floating Ask Truvi
 * launcher (Ask Truvi remains available from the navbar). Opens a chat
 * with the Truvi Ventures number, message pre-filled.
 */

const WHATSAPP_NUMBER = "919196366358"; // +91 91963 66358
const MESSAGE = "Hi Truvi Ventures! I visited your website and I'd like to know more.";
const WA_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(MESSAGE)}`;

/** Official WhatsApp glyph (inline so no external asset is needed). */
function WhatsAppIcon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.59 4.46 1.71 6.4L3.2 28.8l6.58-1.67a12.74 12.74 0 0 0 6.22 1.6h.01c7.06 0 12.79-5.74 12.79-12.8 0-3.42-1.33-6.63-3.75-9.05a12.72 12.72 0 0 0-9.05-3.68zm0 23.36h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.02 1.07-3.92-.25-.4a10.55 10.55 0 0 1-1.63-5.65c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.57 10.57 0 0 1 3.11 7.53c0 5.87-4.78 10.65-10.65 10.65zm5.84-7.97c-.32-.16-1.89-.93-2.19-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66 0 1.57 1.14 3.09 1.3 3.3.16.21 2.25 3.44 5.45 4.82.76.33 1.36.53 1.82.67.77.25 1.46.21 2.01.13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z" />
    </svg>
  );
}

export default function WhatsAppFloat() {
  return (
    <motion.a
      href={WA_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with Truvi Ventures on WhatsApp"
      initial={{ opacity: 0, scale: 0.6, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group fixed bottom-6 right-6 z-50 flex items-center"
    >
      {/* Hover label */}
      <span className="pointer-events-none mr-3 hidden translate-x-2 rounded-full border border-white/15 bg-[#0a0d14]/95 px-4 py-2 text-xs font-medium text-white opacity-0 shadow-xl backdrop-blur transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:block">
        Chat with us on WhatsApp
      </span>

      <span className="relative grid size-14 place-items-center">
        {/* Soft pulse ring */}
        <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366]/30" style={{ animationDuration: "2.4s" }} />
        {/* Button */}
        <span className="relative grid size-14 place-items-center rounded-full border border-white/20 bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white shadow-[0_8px_30px_rgba(37,211,102,0.35)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_8px_40px_rgba(37,211,102,0.55)]">
          <WhatsAppIcon />
        </span>
      </span>
    </motion.a>
  );
}
