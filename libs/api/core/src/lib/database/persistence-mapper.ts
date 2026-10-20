/**
 * Traduit un agrégat du domaine vers sa ligne de table, et inversement.
 * Les sous-classes vivent dans `infra/` : le domaine ne connaît pas sa forme persistée.
 */
export abstract class PersistenceMapper<TDomain, TRow> {
  /** Reconstruit l'agrégat sans rejouer ses règles de création (cf. `restore`). */
  abstract toDomain(row: TRow): TDomain;

  abstract toRow(entity: TDomain): TRow;

  toDomainList(rows: readonly TRow[]): TDomain[] {
    return rows.map((row) => this.toDomain(row));
  }
}
