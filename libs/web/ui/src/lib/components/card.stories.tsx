import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = { title: 'Card', component: Card } satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Titre</CardTitle>
        <CardDescription>Description</CardDescription>
      </CardHeader>
      <CardContent>Contenu</CardContent>
      <CardFooter>Pied</CardFooter>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Titre')).toBeVisible();
    await expect(canvas.getByText('Pied')).toBeVisible();
  },
};
