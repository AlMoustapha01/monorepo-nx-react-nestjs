import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Badge } from './badge';

const meta = {
  title: 'Badge',
  component: Badge,
  args: { children: 'Nouveau' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nouveau')).toBeVisible();
  },
};

export const Secondary: Story = { args: { variant: 'secondary' } };
export const Destructive: Story = { args: { variant: 'destructive' } };
export const Outline: Story = { args: { variant: 'outline' } };
