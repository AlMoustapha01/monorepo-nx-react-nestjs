import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils/cn';

const text = cva('', {
  variants: {
    size: { sm: 'text-sm', base: 'text-base', lg: 'text-lg' },
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      destructive: 'text-destructive',
    },
    weight: { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' },
  },
  defaultVariants: { size: 'base', tone: 'default', weight: 'normal' },
});

export interface TextProps extends Omit<ComponentProps<'p'>, 'className'> {
  as?: 'p' | 'span' | 'div';
  size?: 'sm' | 'base' | 'lg';
  tone?: 'default' | 'muted' | 'destructive';
  weight?: 'normal' | 'medium' | 'semibold';
  className?: string;
}

export function Text({
  as: Tag = 'p',
  size,
  tone,
  weight,
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Tag {...props} className={cn(text({ size, tone, weight }), className)}>
      {children}
    </Tag>
  );
}
