'use client';
import { useMotionValue, useSpring, motion } from 'motion/react';

/** Renders the single primary action used throughout Latch. */
export default function PrimaryButton({ onClick }: { onClick: () => void }) {
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 });
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 });
  return <motion.button style={{ x, y }} onClick={onClick} className="group mt-8 inline-flex items-center gap-3 h-12 pl-6 pr-1.5 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"><span>Run the invoice</span><span className="w-8 h-8 rounded-full bg-[var(--bg-primary)]/15 flex items-center justify-center transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-px"><span className="material-icons text-sm">north_east</span></span></motion.button>;
}
