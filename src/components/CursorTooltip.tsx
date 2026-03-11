import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getTextShadow } from '../utils/ui';

export const CursorTooltip = ({ text, visible, strokeWidth, textScale }: { text: string; visible: boolean, strokeWidth: number, textScale: number }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          style={{
            position: 'fixed', left: pos.x, top: pos.y - 15, zIndex: 9999,
            pointerEvents: 'none', textShadow: getTextShadow(strokeWidth, textScale),
            transform: 'translate(-50%, -100%)',
          }}
          className="bg-zinc-800 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-white/10 max-w-[320px] text-center leading-relaxed whitespace-normal break-words"
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
