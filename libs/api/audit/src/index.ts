// Façade du domaine audit : seul point d'entrée autorisé pour le reste du monorepo.
// Pas d'export * : chaque symbole exposé est un engagement envers les autres domaines.
export { AuditModule } from './lib/audit.module';
