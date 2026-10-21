import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Input } from './input';
import { Label } from './label';

const meta = { title: 'Label' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  render: () => (
    <div>
      <Label htmlFor="email">Courriel</Label>
      <Input id="email" type="email" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Courriel')).toBeInstanceOf(HTMLInputElement);
  },
};
