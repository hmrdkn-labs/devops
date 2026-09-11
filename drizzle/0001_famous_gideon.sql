CREATE TABLE `unit_task_progress` (
	`user_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`unit_revision` integer NOT NULL,
	`task_type` text NOT NULL,
	`task_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `unit_id`, `task_type`, `task_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_unit_task_progress_user_unit` ON `unit_task_progress` (`user_id`,`unit_id`);