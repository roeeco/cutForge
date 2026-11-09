// D1 schema (Drizzle). Classes and submission records; files live in R2.
import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  open: integer('open', { mode: 'boolean' }).notNull().default(true),
  /** Optional calibrated material profile (JSON) students are checked against. */
  material: text('material'),
  /** Quick build (milestone 37): the mode students start in ('quick' | 'workshop' | null), and whether they can switch. */
  mode: text('mode'),
  modeLocked: integer('mode_locked', { mode: 'boolean' }).notNull().default(false),
  /** Missions offered to the class (milestone 40): a JSON list of mission ids, or null for all. */
  missions: text('missions'),
  createdAt: integer('created_at').notNull(),
});

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    displayName: text('display_name').notNull(),
    title: text('title').notNull(),
    materialId: text('material_id').notNull(),
    materialKind: text('material_kind').notNull(),
    thickness: integer('thickness_um').notNull(),
    pieceCount: integer('piece_count').notNull(),
    status: text('status', { enum: ['new', 'cut'] }).notNull().default('new'),
    /** Replaced by a newer submission from the same device (kept as history). */
    superseded: integer('superseded', { mode: 'boolean' }).notNull().default(false),
    /** The mission the design was made for (milestone 40), and how many of its goals it meets. */
    mission: text('mission'),
    goalsMet: integer('goals_met'),
    goalsTotal: integer('goals_total'),
    projectKey: text('project_key').notNull(),
    previewKey: text('preview_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('submissions_class').on(t.classId, t.createdAt)],
);
