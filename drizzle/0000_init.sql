CREATE TYPE "public"."cn_access" AS ENUM('direct', 'unstable', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('free', 'freemium', 'paid', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."raw_status" AS ENUM('pending', 'processed', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_type" AS ENUM('new_tool', 'field_change', 'suspect_offline', 'duplicate', 'user_report');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('draft', 'listed', 'suspect_offline', 'offline', 'rejected');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"description_en" text,
	"description_zh" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_rankings" (
	"category_id" integer NOT NULL,
	"locale" text NOT NULL,
	"tool_ids" jsonb NOT NULL,
	"p_best" jsonb NOT NULL,
	"tie_at_top" boolean DEFAULT false NOT NULL,
	"judgments" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_rankings_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"tool_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_stats_tool_id_day_pk" PRIMARY KEY("tool_id","day")
);
--> statement-breakpoint
CREATE TABLE "jev_judgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"tool_id" integer,
	"raw_item_id" integer,
	"other_tool_id" integer,
	"category_id" integer,
	"locale" text,
	"question" text NOT NULL,
	"probabilities" jsonb NOT NULL,
	"judge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"log" text DEFAULT '' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hash" text NOT NULL,
	"status" "raw_status" DEFAULT 'pending' NOT NULL,
	"matched_tool_id" integer,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "review_type" NOT NULL,
	"tool_id" integer,
	"raw_item_id" integer,
	"payload" jsonb NOT NULL,
	"confidence" real,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewer" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"locale" text NOT NULL,
	"results" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"tool_id" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"ok" boolean NOT NULL,
	"page_hash" text,
	"pricing_hash" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limit_ms" integer DEFAULT 1500 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tool_categories" (
	"tool_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tool_categories_tool_id_category_id_pk" PRIMARY KEY("tool_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"logo_url" text,
	"image_url" text,
	"tagline_en" text DEFAULT '' NOT NULL,
	"tagline_zh" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_zh" text DEFAULT '' NOT NULL,
	"features_en" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features_zh" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"use_cases_en" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"use_cases_zh" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_type" "pricing_type" DEFAULT 'unknown' NOT NULL,
	"pricing_note_en" text DEFAULT '' NOT NULL,
	"pricing_note_zh" text DEFAULT '' NOT NULL,
	"cn_access" "cn_access" DEFAULT 'unknown' NOT NULL,
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"open_source" boolean DEFAULT false NOT NULL,
	"has_cn_ui" boolean DEFAULT false NOT NULL,
	"has_enterprise" boolean DEFAULT false NOT NULL,
	"company" text,
	"company_region" text,
	"origin_country" text,
	"global_url" text,
	"available_regions" text[] DEFAULT '{}' NOT NULL,
	"status" "tool_status" DEFAULT 'draft' NOT NULL,
	"maturity" real,
	"launched_at" timestamp with time zone,
	"listed_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safety" jsonb,
	"heat_score" real DEFAULT 0 NOT NULL,
	"ai_score_zh" real,
	"ai_score_en" real,
	"rank_score_zh" real DEFAULT 0 NOT NULL,
	"rank_score_en" real DEFAULT 0 NOT NULL,
	"embedding" jsonb,
	"search_text" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"merged_into_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jev_tool_idx" ON "jev_judgments" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "jev_cat_idx" ON "jev_judgments" USING btree ("category_id","created_at");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "job_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "login_key_idx" ON "login_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_hash_idx" ON "raw_items" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "raw_status_idx" ON "raw_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_status_idx" ON "review_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "snap_tool_idx" ON "snapshots" USING btree ("tool_id","checked_at");--> statement-breakpoint
CREATE INDEX "tc_cat_idx" ON "tool_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_slug_idx" ON "tools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tools_domain_idx" ON "tools" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "tools_status_idx" ON "tools" USING btree ("status");