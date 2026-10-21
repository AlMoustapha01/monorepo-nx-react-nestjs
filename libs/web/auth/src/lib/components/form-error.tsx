import { Text } from '@nx-react-nestjs/web-ui';

/** Erreur globale d'un formulaire, annoncée aux lecteurs d'écran. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text size="sm" tone="destructive" role="alert">
      {message}
    </Text>
  );
}
