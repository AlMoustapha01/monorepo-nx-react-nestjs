import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from './text';

const meta = {
  title: 'Text',
  component: Text,
  args: { children: 'Un paragraphe de texte' },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Muted: Story = { args: { tone: 'muted', size: 'sm' } };

export const Destructive: Story = { args: { tone: 'destructive', weight: 'semibold' } };
