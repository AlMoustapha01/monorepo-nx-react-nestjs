import { Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export const DATABASE = Symbol('DATABASE');

export type Database = NodePgDatabase;

export const InjectDatabase = () => Inject(DATABASE);
