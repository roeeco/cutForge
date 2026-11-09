ALTER TABLE `classes` ADD `mode` text;--> statement-breakpoint
ALTER TABLE `classes` ADD `mode_locked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `classes` ADD `missions` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `mission` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `goals_met` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `goals_total` integer;
