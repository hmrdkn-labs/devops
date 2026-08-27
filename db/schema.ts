import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_user_email').on(table.email)]);

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('idx_session_token').on(table.token),
  index('idx_session_user_expires').on(table.userId, table.expiresAt),
]);

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  issuer: text('issuer').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_account_issuer_account').on(table.issuer, table.accountId),
  index('idx_account_user').on(table.userId),
]);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_verification_identifier').on(table.identifier)]);

export const learnerProfile = sqliteTable('learner_profile', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  activePathId: text('active_path_id').notNull().default('path:from-process-to-pod'),
  timezone: text('timezone').notNull().default('UTC'),
  requestedRetention: real('requested_retention').notNull().default(0.9),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const attempts = sqliteTable('attempt', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  unitId: text('unit_id').notNull(),
  unitRevision: integer('unit_revision').notNull(),
  questionId: text('question_id').notNull(),
  objectiveIdsJson: text('objective_ids_json').notNull(),
  answerMarkdown: text('answer_markdown').notNull(),
  criticalPointsJson: text('critical_points_json').notNull().default('[]'),
  submittedAt: integer('submitted_at').notNull(),
}, (table) => [
  uniqueIndex('idx_attempt_user_idempotency').on(table.userId, table.idempotencyKey),
  index('idx_attempt_user_unit_time').on(table.userId, table.unitId, table.submittedAt),
]);

export const reviewEvents = sqliteTable('review_event', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  cardId: text('card_id').notNull(),
  unitId: text('unit_id').notNull(),
  unitRevision: integer('unit_revision').notNull(),
  objectiveIdsJson: text('objective_ids_json').notNull(),
  cardType: text('card_type').notNull(),
  rating: integer('rating').notNull(),
  reviewedAt: integer('reviewed_at').notNull(),
  scheduledDays: real('scheduled_days').notNull(),
  elapsedDays: real('elapsed_days').notNull(),
  stateBefore: integer('state_before').notNull(),
  stateAfter: integer('state_after').notNull(),
}, (table) => [
  uniqueIndex('idx_review_user_idempotency').on(table.userId, table.idempotencyKey),
  index('idx_review_user_card_time').on(table.userId, table.cardId, table.reviewedAt),
]);

export const fsrsCards = sqliteTable('fsrs_card', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull(),
  unitId: text('unit_id').notNull(),
  unitRevision: integer('unit_revision').notNull(),
  cardType: text('card_type').notNull(),
  cardJson: text('card_json').notNull(),
  dueAt: integer('due_at').notNull(),
  lastReviewAt: integer('last_review_at'),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.cardId] }),
  index('idx_fsrs_due').on(table.userId, table.dueAt, table.cardType),
]);

export const unitEvidence = sqliteTable('unit_evidence', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  unitId: text('unit_id').notNull(),
  objectiveId: text('objective_id').notNull(),
  objectiveHash: text('objective_hash').notNull(),
  encounteredAt: integer('encountered_at'),
  recalledAt: integer('recalled_at'),
  recallScore: real('recall_score').notNull().default(0),
  appliedAt: integer('applied_at'),
  applicationScore: real('application_score').notNull().default(0),
  retainedAt: integer('retained_at'),
  retentionScore: real('retention_score').notNull().default(0),
  revalidationRequired: integer('revalidation_required', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.unitId, table.objectiveId] }),
  index('idx_evidence_user_unit').on(table.userId, table.unitId),
]);

export const privateAnswers = sqliteTable('private_answer', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  unitId: text('unit_id').notNull(),
  unitRevision: integer('unit_revision').notNull(),
  questionId: text('question_id').notNull(),
  answerMarkdown: text('answer_markdown').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_private_answer_user_unit').on(table.userId, table.unitId, table.createdAt),
]);

export const notes = sqliteTable('note', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  unitId: text('unit_id').notNull(),
  markdown: text('markdown').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.unitId] }),
  index('idx_note_user_updated').on(table.userId, table.updatedAt),
]);

export const contentAcknowledgements = sqliteTable('content_acknowledgement', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  unitId: text('unit_id').notNull(),
  revision: integer('revision').notNull(),
  contentHash: text('content_hash').notNull(),
  acknowledgedAt: integer('acknowledged_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.unitId, table.revision] }),
]);
