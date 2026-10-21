// Peers optionnels de better-auth (adapters et intégrations : drizzle, prisma, vitest, react…).
// Ceux présents à la racine pour d'autres usages lui seraient rattachés, et l'image du service
// d'auth embarquerait vitest, vite, drizzle-kit et esbuild (~120 Mo). Il n'utilise que pg.
const BETTER_AUTH_PEERS_KEPT = new Set(['pg']);

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'better-auth') {
        for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
          if (!BETTER_AUTH_PEERS_KEPT.has(peer)) {
            delete pkg.peerDependencies[peer];
            delete pkg.peerDependenciesMeta?.[peer];
          }
        }
      }
      return pkg;
    },
  },
};
