import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils/cn';

const stack = cva('flex', {
  variants: {
    direction: { row: 'flex-row', column: 'flex-col' },
    gap: { 0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 6: 'gap-6', 8: 'gap-8' },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
    },
    wrap: { true: 'flex-wrap', false: '' },
  },
  defaultVariants: { direction: 'column', gap: 4, wrap: false },
});

export interface StackProps {
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'nav' | 'ul' | 'ol';
  direction?: 'row' | 'column';
  gap?: 0 | 1 | 2 | 3 | 4 | 6 | 8;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Stack({
  as: Tag = 'div',
  direction,
  gap,
  align,
  justify,
  wrap,
  className,
  children,
}: StackProps) {
  return (
    <Tag className={cn(stack({ direction, gap, align, justify, wrap }), className)}>{children}</Tag>
  );
}
