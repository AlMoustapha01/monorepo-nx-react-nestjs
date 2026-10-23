import { useId, type ComponentProps, type ReactNode } from 'react';

import { Input } from './input';
import { Label } from './label';
import { Stack } from './stack';
import { Text } from './text';
import { Textarea } from './textarea';

interface FieldProps {
  label: string;
  /** Message déjà localisé ; relié au champ par aria-describedby. */
  error?: string | undefined;
}

interface ControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

function Field({
  label,
  error,
  control,
}: FieldProps & { control: (props: ControlProps) => ReactNode }) {
  const id = useId();
  const errorId = useId();
  return (
    <Stack gap={2}>
      <Label htmlFor={id}>{label}</Label>
      {control({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <Text id={errorId} size="sm" tone="destructive">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** Champ de formulaire : libellé, `Input` et message d'erreur reliés pour l'accessibilité. */
export function FormField({ label, error, ...input }: FieldProps & ComponentProps<typeof Input>) {
  return <Field label={label} error={error} control={(props) => <Input {...props} {...input} />} />;
}

/** Comme `FormField`, avec un `Textarea` (texte sur plusieurs lignes). */
export function TextareaField({
  label,
  error,
  ...textarea
}: FieldProps & ComponentProps<typeof Textarea>) {
  return (
    <Field label={label} error={error} control={(props) => <Textarea {...props} {...textarea} />} />
  );
}

/** Erreur globale d'un formulaire, annoncée aux lecteurs d'écran. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text size="sm" tone="destructive" role="alert">
      {message}
    </Text>
  );
}
