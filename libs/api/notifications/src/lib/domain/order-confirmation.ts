import type { Currency } from '@nx-react-nestjs/contracts';
import { formatMoney } from './money-format';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface ConfirmedOrder {
  orderId: string;
  currency: Currency;
  totalMinor: number;
  lines: readonly { name: string; quantity: number; unitPriceMinor: number }[];
}

/** Contenu de l'email de confirmation : pur, donc testable sans serveur SMTP. */
export function orderConfirmationEmail(order: ConfirmedOrder): EmailContent {
  const money = (amountMinor: number) => formatMoney(amountMinor, order.currency);
  const lines = order.lines.map((line) => ({
    label: `${line.quantity} × ${line.name}`,
    amount: money(line.unitPriceMinor * line.quantity),
  }));
  const total = money(order.totalMinor);

  return {
    subject: `Votre commande ${order.orderId} est confirmée`,
    text: [
      'Merci pour votre commande.',
      '',
      ...lines.map((line) => `${line.label} : ${line.amount}`),
      '',
      `Total : ${total}`,
      `Référence : ${order.orderId}`,
    ].join('\n'),
    html: [
      '<p>Merci pour votre commande.</p>',
      '<ul>',
      ...lines.map((line) => `<li>${escapeHtml(line.label)} : ${escapeHtml(line.amount)}</li>`),
      '</ul>',
      `<p><strong>Total : ${escapeHtml(total)}</strong></p>`,
      `<p>Référence : ${escapeHtml(order.orderId)}</p>`,
    ].join('\n'),
  };
}

/** Les noms de produits viennent des utilisateurs : jamais insérés tels quels dans du HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
