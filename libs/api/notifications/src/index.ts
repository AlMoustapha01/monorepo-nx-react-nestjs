// Façade du domaine notifications : seul point d'entrée autorisé pour le reste du monorepo.
// Pas d'export * : chaque symbole exposé est un engagement envers les autres domaines.
export { NotificationsModule } from './lib/notifications.module';
