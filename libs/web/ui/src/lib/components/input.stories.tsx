import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Input } from './input';

const meta = {
  title: 'Input',
  component: Input,
  args: { placeholder: 'Saisir', 'aria-label': 'Champ' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Champ' });
    await userEvent.type(input, 'abc');
    await expect(input).toHaveValue('abc');
  },
};

export const Disabled: Story = { args: { disabled: true } };
