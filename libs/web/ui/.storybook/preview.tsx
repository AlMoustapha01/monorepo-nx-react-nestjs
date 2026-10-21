import type { Preview } from '@storybook/react-vite';

import '../src/lib/styles/theme.css';

const preview: Preview = {
  initialGlobals: { theme: 'light' },
  globalTypes: {
    theme: {
      description: 'Thème',
      toolbar: {
        title: 'Thème',
        items: [
          { value: 'light', title: 'Clair' },
          { value: 'dark', title: 'Sombre' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => (
      <div
        className={`${context.globals['theme'] === 'dark' ? 'dark ' : ''}bg-background p-4 text-foreground`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
