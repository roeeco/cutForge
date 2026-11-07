CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`open` integer DEFAULT true NOT NULL,
	`material` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_code_unique` ON `classes` (`code`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`device_id` text NOT NULL,
	`display_name` text NOT NULL,
	`title` text NOT NULL,
	`material_id` text NOT NULL,
	`material_kind` text NOT NULL,
	`thickness_um` integer NOT NULL,
	`piece_count` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`superseded` integer DEFAULT false NOT NULL,
	`project_key` text NOT NULL,
	`preview_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_class` ON `submissions` (`class_id`,`created_at`);