import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils/cn';

const heading = cva('font-semibold tracking-tight text-foreground', {
  variants: {
    level: {
      1: 'text-4xl font-bold',
      2: 'text-3xl',
      3: 'text-2xl',
      4: 'text-xl',
    },
  },
});

export interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  className?: string;
  children?: ReactNode;
}

export function Heading({ level, className, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(heading({ level }), className)}>{children}</Tag>;
}
