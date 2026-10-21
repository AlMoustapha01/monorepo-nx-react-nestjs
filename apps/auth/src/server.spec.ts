import type { IncomingMessage } from 'node:http';
import { clientIp } from './server';

const requestFrom = (remoteAddress: string, forwardedFor?: string) =>
  ({
    socket: { remoteAddress },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  }) as unknown as IncomingMessage;

describe('clientIp', () => {
  it('prend l’adresse du socket sans proxy de confiance, même si le client envoie X-Forwarded-For', () => {
    expect(clientIp(requestFrom('203.0.113.7', '198.51.100.1'), 0)).toBe('203.0.113.7');
  });

  it('remonte d’autant de proxys que de proxys de confiance', () => {
    // Le client a forgé 198.51.100.1 ; le load balancer a ajouté la vraie adresse, 203.0.113.7.
    const request = requestFrom('10.0.0.2', '198.51.100.1, 203.0.113.7');
    expect(clientIp(request, 1)).toBe('203.0.113.7');
  });

  it('ne dépasse pas le début de la chaîne', () => {
    expect(clientIp(requestFrom('10.0.0.2', '203.0.113.7'), 5)).toBe('203.0.113.7');
  });
});
