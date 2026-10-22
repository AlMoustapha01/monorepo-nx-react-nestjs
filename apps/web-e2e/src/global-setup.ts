import { startStack } from './stack';

/** Une stack pour toute l'exécution ; les workers lisent ses URLs dans process.env. */
export default async function globalSetup() {
  const stack = await startStack();
  Object.assign(process.env, stack.env);
  return () => stack.stop();
}
