import React, { useState, useEffect } from 'react';
import { Shield, Key, Copy, X, Clock, Check, AlertCircle, RefreshCw, Smartphone, Sparkles, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

// Custom clipboard copy helper (matching the app's multi-fallback clipboard capability)
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Modern clipboard API failed, trying fallback:', err);
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return !!successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
};

// Base32 decoder matching RFC 4648
function decodeBase32(charString: string): Uint8Array {
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23234567"; // Base32 characters
  const cleanString = charString.toUpperCase().replace(/[\s-]/g, "").replace(/=/g, "");
  const len = cleanString.length;
  if (len === 0) return new Uint8Array(0);

  // Filter valid characters to avoid crashes
  const validBase32Regex = /^[A-Z2-7]+$/;
  if (!validBase32Regex.test(cleanString)) {
    throw new Error("Invalid base32 character");
  }

  const base32charsStandard = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const buffer = new Uint8Array(Math.floor((cleanString.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < cleanString.length; i++) {
    const val = base32charsStandard.indexOf(cleanString[i]);
    if (val === -1) {
      throw new Error("Invalid base32 character");
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer;
}

// TOTP Generator using standard Web Crypto API
async function generateTOTP(secret: string, timeStep = 30): Promise<{ code: string; timeLeft: number }> {
  try {
    const now = Date.now();
    const epoch = Math.floor(now / 1000);
    const counter = Math.floor(epoch / timeStep);
    const timeLeft = timeStep - (epoch % timeStep);

    // 1. Decode base32 secret
    const keyBytes = decodeBase32(secret);
    if (keyBytes.length === 0) {
      return { code: "000000", timeLeft: 30 };
    }

    // 2. Prepare 8-byte counter buffer (big-endian)
    const counterBuffer = new ArrayBuffer(8);
    const dataView = new DataView(counterBuffer);
    dataView.setUint32(0, 0); // High 32 bits are 0 since timestamp is well within 32-bit counter limits
    dataView.setUint32(4, counter); // Low 32-bit counter

    // 3. HMAC-SHA1 calculation
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: { name: "SHA-1" } },
      false,
      ["sign"]
    );

    const signatureBuffer = await window.crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      counterBuffer
    );

    const signatureBytes = new Uint8Array(signatureBuffer);

    // 4. Dynamic Truncation according to RFC 4226 / RFC 6238
    const offset = signatureBytes[signatureBytes.length - 1] & 0xf;
    const binary =
      ((signatureBytes[offset] & 0x7f) << 24) |
      ((signatureBytes[offset + 1] & 0xff) << 16) |
      ((signatureBytes[offset + 2] & 0xff) << 8) |
      (signatureBytes[offset + 3] & 0xff);

    const otp = binary % 1000000;
    const code = otp.toString().padStart(6, "0");

    return { code, timeLeft };
  } catch (error) {
    console.error("TOTP Generation failed:", error);
    return { code: "ERROR", timeLeft: 30 };
  }
}

export default function Authenticator() {
  const [isOpen, setIsOpen] = useState(false);
  
  // Instant Generator State
  const [instantSecret, setInstantSecret] = useState('');
  const [activeInstantSecret, setActiveInstantSecret] = useState('');
  const [instantCode, setInstantCode] = useState<string>('');
  const [instantTimeLeft, setInstantTimeLeft] = useState<number>(30);
  const [instantError, setInstantError] = useState('');
  const [copiedInstant, setCopiedInstant] = useState(false);

  // Handle Instant Code Generation and Auto-updating
  useEffect(() => {
    if (!activeInstantSecret) {
      setInstantCode('');
      return;
    }

    let active = true;

    const updateInstantCode = async () => {
      try {
        const totp = await generateTOTP(activeInstantSecret);
        if (active) {
          setInstantCode(totp.code);
          setInstantTimeLeft(totp.timeLeft);
        }
      } catch (err) {
        if (active) {
          setInstantCode('ERROR');
        }
      }
    };

    updateInstantCode();
    const interval = setInterval(updateInstantCode, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeInstantSecret]);

  // Handle Action to Generate Instant Code
  const handleInstantGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInstantError('');
    
    const cleanSecret = instantSecret.toUpperCase().replace(/[\s-]/g, "").replace(/=/g, "");
    if (!cleanSecret) {
      setInstantError('অনুগ্রহ করে সিক্রেট কী প্রদান করুন। (Secret Key Required)');
      return;
    }

    // Validate Base32 structure
    try {
      decodeBase32(cleanSecret);
      setActiveInstantSecret(cleanSecret);
      toast.success('২এফএ কোড জেনারেট হয়েছে! (2FA Code Generated Successfully)');
    } catch (err) {
      setInstantError('অবৈধ সিক্রেট কী! শুধুমাত্র A-Z এবং ২-৭ অক্ষর ব্যবহার করুন। (Invalid Base32 Secret Key)');
      setActiveInstantSecret('');
      setInstantCode('');
    }
  };

  // Format 2FA code with space in the middle, e.g. "123 456"
  const formatCode = (code: string) => {
    if (!code || code.length !== 6) return code;
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  };

  const handleCopyInstant = async () => {
    if (!instantCode || instantCode === 'ERROR') return;
    const success = await copyToClipboard(instantCode);
    if (success) {
      setCopiedInstant(true);
      toast.success('২এফএ কোড কপি করা হয়েছে! (2FA Code Copied)', {
        description: 'ফেসবুক বা জিমেইল টু-ফ্যাক্টর বক্সে পেস্ট করুন।',
        duration: 2000
      });
      setTimeout(() => setCopiedInstant(false), 2000);
    } else {
      toast.error('Copy failed');
    }
  };

  return (
    <div id="authenticator-root" className="fixed bottom-6 right-6 z-[99]">
      {/* Floating Action Button - Optimized for PC with a premium tech-themed design */}
      <motion.button
        id="authenticator-fab"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.06, y: -2 }}
        whileTap={{ scale: 0.95 }}
        className={`relative w-14 h-14 rounded-2xl text-white shadow-[0_10px_35px_rgba(79,70,229,0.3)] flex items-center justify-center cursor-pointer transition-all border ${
          isOpen 
            ? 'bg-slate-900 border-slate-800' 
            : 'bg-gradient-to-tr from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 border-indigo-500/20'
        }`}
        title="Instant 2FA Authenticator"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close-icon"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6 text-slate-100" />
            </motion.div>
          ) : (
            <motion.div
              key="open-icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative flex items-center justify-center"
            >
              <Shield className="w-6 h-6 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.15)]" />
              {/* Pulsing indicator dot */}
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-indigo-650 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-indigo-650 rounded-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* PC-optimized compact, ultra-clean design with absolutely zero clutter */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="authenticator-panel"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: -10 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            className="absolute bottom-16 right-0 w-[380px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(15,23,42,0.15)] border border-slate-100 overflow-hidden flex flex-col"
          >
            {/* Header - Ultra Clean and Minimal */}
            <div className="relative overflow-hidden bg-slate-50 p-4 shrink-0 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100/50">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1.5">
                      2FA Code Generator
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">ইনস্ট্যান্ট ২এফএ লগইন কোড জেনারেটর</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Body - Purely 2FA Instant Input and Output (No Tabs, No Saved Lists) */}
            <div className="p-5 bg-white space-y-4">
              {instantError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span className="flex-1">{instantError}</span>
                </div>
              )}

              <form onSubmit={handleInstantGenerate} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                      Paste 2FA Secret Key (সিক্রেট কী দিন)
                    </label>
                    <span className="text-red-500 font-bold text-xs">*</span>
                  </div>
                  <div className="relative">
                    <textarea
                      rows={2}
                      required
                      value={instantSecret}
                      onChange={(e) => {
                        setInstantSecret(e.target.value);
                        if (!e.target.value) {
                          setActiveInstantSecret('');
                          setInstantCode('');
                        }
                      }}
                      placeholder="ফেসবুক থেকে পাওয়া ২এফএ সিক্রেট কি এখানে পেস্ট করুন..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs sm:text-sm font-mono text-slate-800 uppercase tracking-widest placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 resize-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> জেনারেট কোড (Generate Code)
                  </button>
                  
                  {instantSecret && (
                    <button
                      type="button"
                      onClick={() => {
                        setInstantSecret('');
                        setActiveInstantSecret('');
                        setInstantCode('');
                        setInstantError('');
                      }}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl transition-all cursor-pointer border border-slate-250"
                    >
                      মুছুন (Clear)
                    </button>
                  )}
                </div>
              </form>

              {/* Dynamic visual output */}
              <AnimatePresence mode="wait">
                {instantCode ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 8 }}
                    className="bg-indigo-50/40 border border-indigo-100/80 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden"
                  >
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-indigo-100/50 shadow-sm">
                      <span className={`w-1.5 h-1.5 rounded-full ${instantTimeLeft <= 6 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
                      <span className="font-mono text-[9px] font-bold text-slate-500">{instantTimeLeft}s remaining</span>
                    </div>

                    <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1">
                      FB LOGIN CODE
                    </span>
                    
                    <div 
                      onClick={handleCopyInstant}
                      className="font-mono text-4xl font-extrabold text-slate-900 tracking-[0.18em] pl-[0.18em] my-2 cursor-pointer hover:scale-103 active:scale-97 transition-all select-none"
                      title="Click to Copy"
                    >
                      {formatCode(instantCode)}
                    </div>

                    <p className="text-[10px] text-slate-400 mb-3 font-semibold">
                      Click the code or button below to copy instantly
                    </p>

                    <button
                      onClick={handleCopyInstant}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        copiedInstant
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                      }`}
                    >
                      {copiedInstant ? (
                        <>
                          <CheckCircle className="w-4 h-4" /> কোড কপি হয়েছে! (Copied)
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" /> কোড কপি করুন (Copy 2FA Code)
                        </>
                      )}
                    </button>
                  </motion.div>
                ) : (
                  <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Shield className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold text-slate-600">কোড জেনারেট করুন</p>
                    <p className="text-[10px] text-slate-400 leading-normal max-w-[240px]">
                      উপরে আপনার সিক্রেট কি দিয়ে জেনারেট বাটনে চাপ দিলে এখানে অটো-আপডেটিং ২এফএ কোড দেখতে পাবেন।
                    </p>
                  </div>
                )}
              </AnimatePresence>

              {/* Quick shortcut generator */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10.5px] text-slate-400 font-bold uppercase tracking-wider">Test Secret Key:</span>
                <button
                  type="button"
                  onClick={() => {
                    setInstantSecret('JBSWY3DPEHPK3PXP');
                    setActiveInstantSecret('JBSWY3DPEHPK3PXP');
                    setInstantError('');
                  }}
                  className="text-[10px] px-2.5 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg font-bold border border-slate-200/80 hover:border-indigo-200 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Key className="w-3 h-3 text-indigo-500" /> JBSWY3DPEHPK3PXP (Demo)
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-3 text-center border-t border-slate-100 shrink-0 select-none">
              <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1 font-semibold">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Auto-syncing with secure PC clock
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
