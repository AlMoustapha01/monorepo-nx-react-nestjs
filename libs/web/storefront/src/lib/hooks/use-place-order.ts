import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import type { OrderResponse, PlaceOrderInput } from '@nx-react-nestjs/contracts';
import {
  ApiError,
  useIdempotentMutation,
  type ApiClient,
  type UseIdempotentMutationResult,
} from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from '../data/keys';
import { placeOrder } from '../data/orders';
import { clearCart } from '../states/cart';

export const PENDING_ORDER_STORAGE_KEY = 'app.pendingOrder';

const pendingOrderSchema = z.object({ key: z.string().min(1), payload: z.string() });
type PendingOrder = z.infer<typeof pendingOrderSchema>;

/** Contenu gardé en mémoire quand sessionStorage est inutilisable ; `undefined` = pas de repli. */
let memoryRaw: string | null | undefined;

function readPending(): PendingOrder | null {
  let raw = memoryRaw;
  if (raw === undefined) {
    try {
      raw = sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    } catch {
      raw = null;
    }
  }
  if (raw === null) return null;
  try {
    const result = pendingOrderSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writePending(pending: PendingOrder | null): void {
  const raw = pending && JSON.stringify(pending);
  try {
    if (raw === null) sessionStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
    else sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, raw);
    memoryRaw = undefined;
  } catch {
    memoryRaw = raw;
  }
}

/**
 * Clé de la commande en cours : réutilisée tant que son contenu ne change pas, pour qu'un
 * nouveau clic après un échec ou un rechargement rejoue la même commande au lieu d'en créer une
 * seconde (une erreur ne consomme pas la clé côté API).
 */
function orderIdempotencyKey(input: PlaceOrderInput): string {
  const payload = JSON.stringify(input);
  const pending = readPending();
  if (pending?.payload === payload) return pending.key;
  const key = crypto.randomUUID();
  writePending({ key, payload });
  return key;
}

export function isProductUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'PRODUCT_UNAVAILABLE';
}

function unavailableProductIds(error: ApiError): string[] {
  const ids = error.details?.['productIds'];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** Passe la commande ; l'`Idempotency-Key` est gardée en session jusqu'au succès (voir `orderIdempotencyKey`). */
export function usePlaceOrder(
  api: ApiClient,
): UseIdempotentMutationResult<OrderResponse, PlaceOrderInput> {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useIdempotentMutation<OrderResponse, PlaceOrderInput>({
    mutationFn: (input, idempotencyKey) => placeOrder(api, input, idempotencyKey),
    idempotencyKey: orderIdempotencyKey,
    onSuccess: async (order) => {
      writePending(null);
      clearCart();
      queryClient.setQueryData(storefrontKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: storefrontKeys.orders() });
      await navigate({ to: '/commandes/$orderId', params: { orderId: order.id } });
    },
    onError: (error) => {
      if (error instanceof ApiError && isProductUnavailable(error)) {
        for (const id of unavailableProductIds(error)) {
          void queryClient.invalidateQueries({ queryKey: storefrontKeys.product(id) });
        }
        return;
      }
      toast.error(t`Une erreur est survenue.`);
    },
  });
}
