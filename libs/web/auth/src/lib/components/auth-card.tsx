import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Stack,
} from '@nx-react-nestjs/web-ui';

interface AuthCardProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Cadre commun des pages d'authentification. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Stack as="section" align="center" className="p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Titre de la page : h1, à la taille d'un titre de carte. */}
          <Heading level={1} className="text-2xl">
            {title}
          </Heading>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <CardFooter>{footer}</CardFooter>}
      </Card>
    </Stack>
  );
}
