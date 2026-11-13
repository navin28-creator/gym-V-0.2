import React from 'react';
import { motion } from 'motion/react';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionWrapper: React.FC<SectionWrapperProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface AnimatedSectionPanelProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const AnimatedSectionPanel: React.FC<AnimatedSectionPanelProps> = ({
  children,
  className = '',
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.24, delay, ease: EASE_OUT_EXPO }}
      className={`transition-all duration-200 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/30 hover:bg-neutral-900/95 ${className}`}
    >
      {children}
    </motion.div>
  );
};

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  onClick?: () => void;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className = '',
  index = 0,
  onClick,
}) => {
  const cappedDelay = Math.min(index * 0.045, 0.28);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      whileHover={{ y: -3, scale: 1.008 }}
      transition={{ duration: 0.2, delay: cappedDelay, ease: EASE_OUT_EXPO }}
      onClick={onClick}
      className={`transition-colors duration-200 hover:border-amber-500/40 hover:shadow-xl hover:shadow-black/40 ${className}`}
    >
      {children}
    </motion.div>
  );
};
