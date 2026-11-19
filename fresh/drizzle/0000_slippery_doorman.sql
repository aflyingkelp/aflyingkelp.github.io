CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`author_hash` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`video_id` text,
	`video_title` text,
	`video_channel` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_created_idx` ON `chat_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_author_created_idx` ON `chat_messages` (`author_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_reports` (
	`message_id` text NOT NULL,
	`reporter_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `reporter_hash`)
);
