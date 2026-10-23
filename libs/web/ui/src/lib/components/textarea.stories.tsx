import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Textarea } from './textarea';

const meta = {
  title: 'Textarea',
  component: Textarea,
  args: { placeholder: 'Saisir', 'aria-label': 'Texte' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole('textbox', { name: 'Texte' });
    await userEvent.type(textarea, 'ligne 1{enter}ligne 2');
    await expect(textarea).toHaveValue('ligne 1\nligne 2');
  },
};

export const Invalid: Story = { args: { 'aria-invalid': true } };

export const Disabled: Story = { args: { disabled: true } };
