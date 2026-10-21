import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta = { title: 'Dialog', component: Dialog } satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Ouvrir</Button>
      </DialogTrigger>
      <DialogContent closeLabel="Fermer">
        <DialogHeader>
          <DialogTitle>Titre</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogHeader>
        <DialogFooter>Pied</DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    // Le dialog est rendu dans un portail sur document.body.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Ouvrir' }));
    await expect(await body.findByRole('dialog')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  },
};
