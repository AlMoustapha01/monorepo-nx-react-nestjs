import '@testing-library/jest-dom/vitest';
import { setProjectAnnotations } from '@storybook/react-vite';
import * as preview from '../.storybook/preview';

// Les stories sont rejouées comme tests avec les mêmes décorateurs que Storybook.
setProjectAnnotations(preview);
