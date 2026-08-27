CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`issuer` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_issuer_account` ON `account` (`issuer`,`accountId`);--> statement-breakpoint
CREATE INDEX `idx_account_user` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`unit_id` text NOT NULL,
	`unit_revision` integer NOT NULL,
	`question_id` text NOT NULL,
	`objective_ids_json` text NOT NULL,
	`answer_markdown` text NOT NULL,
	`critical_points_json` text DEFAULT '[]' NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attempt_user_idempotency` ON `attempt` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_attempt_user_unit_time` ON `attempt` (`user_id`,`unit_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `content_acknowledgement` (
	`user_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content_hash` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `unit_id`, `revision`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fsrs_card` (
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`unit_revision` integer NOT NULL,
	`card_type` text NOT NULL,
	`card_json` text NOT NULL,
	`due_at` integer NOT NULL,
	`last_review_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `card_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fsrs_due` ON `fsrs_card` (`user_id`,`due_at`,`card_type`);--> statement-breakpoint
CREATE TABLE `learner_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_path_id` text DEFAULT 'path:from-process-to-pod' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`requested_retention` real DEFAULT 0.9 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `note` (
	`user_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `unit_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_note_user_updated` ON `note` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `private_answer` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`unit_revision` integer NOT NULL,
	`question_id` text NOT NULL,
	`answer_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_private_answer_user_unit` ON `private_answer` (`user_id`,`unit_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `review_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`card_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`unit_revision` integer NOT NULL,
	`objective_ids_json` text NOT NULL,
	`card_type` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	`scheduled_days` real NOT NULL,
	`elapsed_days` real NOT NULL,
	`state_before` integer NOT NULL,
	`state_after` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_user_idempotency` ON `review_event` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_review_user_card_time` ON `review_event` (`user_id`,`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_token` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user_expires` ON `session` (`userId`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `unit_evidence` (
	`user_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`objective_hash` text NOT NULL,
	`encountered_at` integer,
	`recalled_at` integer,
	`recall_score` real DEFAULT 0 NOT NULL,
	`applied_at` integer,
	`application_score` real DEFAULT 0 NOT NULL,
	`retained_at` integer,
	`retention_score` real DEFAULT 0 NOT NULL,
	`revalidation_required` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `unit_id`, `objective_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_user_unit` ON `unit_evidence` (`user_id`,`unit_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_email` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);
--> statement-breakpoint
PRAGMA optimize;
