// Façade du domaine catalogue : seul point d'entrée autorisé pour le reste du monorepo.
// Pas d'export * : chaque symbole exposé est un engagement envers les autres domaines.
export { CatalogModule } from './lib/catalog.module';
export { CatalogFacade } from './lib/application/catalog.facade';
export type { ProductSnapshot } from './lib/application/catalog.contracts';
