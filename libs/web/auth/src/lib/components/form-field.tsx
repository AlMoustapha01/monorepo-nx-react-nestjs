import { useId, type ComponentProps } from 'react';
import { Input, Label, Stack, Text } from '@nx-react-nestjs/web-ui';

interface FormFieldProps extends ComponentProps<typeof Input> {
  label: string;
  /** Message déjà localisé ; relié au champ par aria-describedby. */
  error?: string | undefined;
}

export function FormField({ label, error, ...input }: FormFieldProps) {
  const id = useId();
  const errorId = useId();
  return (
    <Stack gap={2}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error && (
        <Text id={errorId} size="sm" tone="destructive">
          {error}
        </Text>
      )}
    </Stack>
  );
}
