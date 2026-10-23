import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FormError, FormField, TextareaField } from './form-field';

const meta = {
  title: 'FormField',
  component: FormField,
  args: { label: 'Adresse email', type: 'email' },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Adresse email');
    await userEvent.type(input, 'ada@example.com');
    await expect(input).toHaveValue('ada@example.com');
    await expect(input).not.toHaveAttribute('aria-invalid');
  },
};

export const WithError: Story = {
  args: { error: 'Saisissez une adresse email valide.' },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Adresse email');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription('Saisissez une adresse email valide.');
  },
};

export const Multiline: Story = {
  render: () => <TextareaField label="Description" error="Saisissez une description." rows={3} />,
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByLabelText('Description');
    await expect(textarea.tagName).toBe('TEXTAREA');
    await expect(textarea).toHaveAttribute('aria-invalid', 'true');
    await expect(textarea).toHaveAccessibleDescription('Saisissez une description.');
  },
};

export const FormLevelError: Story = {
  render: () => <FormError message="Identifiants incorrects." />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'Identifiants incorrects.',
    );
  },
};
