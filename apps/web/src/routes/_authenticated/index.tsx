import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { Heading } from '@nx-react-nestjs/web-ui';

function Home() {
  return (
    <Heading level={1}>
      <Trans>Accueil</Trans>
    </Heading>
  );
}

export const Route = createFileRoute('/_authenticated/')({ component: Home });
