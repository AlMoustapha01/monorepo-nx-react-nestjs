import { createFileRoute } from '@tanstack/react-router';
import { Heading } from '@nx-react-nestjs/web-ui';

export const Route = createFileRoute('/')({
  component: () => <Heading level={1}>Boilerplate web</Heading>,
});
