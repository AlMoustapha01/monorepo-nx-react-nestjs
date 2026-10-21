import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stack } from './stack';

const meta = {
  title: 'Stack',
  component: Stack,
  args: {
    children: [<span key="a">A</span>, <span key="b">B</span>, <span key="c">C</span>],
  },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Column: Story = {};

export const Row: Story = { args: { direction: 'row', gap: 2, align: 'center' } };
