import { composeStories } from '@storybook/react-vite';

type StoriesModule = Parameters<typeof composeStories>[0];
type ComposedStory = { run: () => Promise<void> };

const modules = import.meta.glob<StoriesModule>('./**/*.stories.tsx', { eager: true });

// Chaque story est exécutée comme un test (rendu + play) : les assertions sont dans les `play`.
// oxlint-disable-next-line vitest/valid-title
for (const [path, module] of Object.entries(modules)) {
  // oxlint-disable-next-line vitest/valid-title
  describe(path, () => {
    const stories = Object.entries(composeStories(module)) as [string, ComposedStory][];
    for (const [name, Story] of stories) {
      // oxlint-disable-next-line vitest/expect-expect
      it(`${path} › ${name}`, () => Story.run());
    }
  });
}
