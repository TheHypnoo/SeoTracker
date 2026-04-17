CREATE TYPE "public"."audit_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."audit_trigger" AS ENUM('MANUAL', 'SCHEDULED', 'WEBHOOK');--> statement-breakpoint
CREATE TYPE "public"."comparison_change_type" AS ENUM('SCORE_DROP', 'SCORE_IMPROVEMENT', 'NEW_ISSUE', 'RESOLVED_ISSUE', 'SEVERITY_REGRESSION', 'SEVERITY_IMPROVEMENT');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('CSV', 'PDF', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('HISTORY', 'AUDIT_RESULT', 'COMPARISON', 'ISSUES', 'METRICS');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."issue_category" AS ENUM('ON_PAGE', 'TECHNICAL', 'CRAWLABILITY', 'MEDIA', 'PERFORMANCE');--> statement-breakpoint
CREATE TYPE "public"."issue_code" AS ENUM('DOMAIN_UNREACHABLE', 'MISSING_TITLE', 'TITLE_TOO_SHORT', 'TITLE_TOO_LONG', 'MISSING_META_DESCRIPTION', 'META_DESCRIPTION_TOO_SHORT', 'META_DESCRIPTION_TOO_LONG', 'MISSING_H1', 'MULTIPLE_H1', 'HEADING_HIERARCHY_SKIP', 'MISSING_CANONICAL', 'CANONICAL_MISMATCH', 'MULTIPLE_CANONICALS', 'CANONICAL_NOT_ABSOLUTE', 'IMAGE_WITHOUT_ALT', 'IMAGE_MISSING_DIMENSIONS', 'MISSING_ROBOTS', 'MISSING_SITEMAP', 'BROKEN_LINK', 'MISSING_VIEWPORT', 'MISSING_LANG', 'MISSING_OPEN_GRAPH', 'MISSING_TWITTER_CARD', 'MISSING_STRUCTURED_DATA', 'INVALID_STRUCTURED_DATA', 'STRUCTURED_DATA_MISSING_TYPE', 'INVALID_HREFLANG', 'MIXED_CONTENT', 'NO_HTTPS', 'MISSING_HSTS', 'REDIRECT_CHAIN', 'ROBOTS_DISALLOWS_ALL', 'SITEMAP_EMPTY', 'SITEMAP_INVALID', 'MISSING_FAVICON', 'PAGE_TOO_HEAVY', 'DOM_TOO_LARGE', 'META_NOINDEX', 'META_NOFOLLOW', 'AI_CRAWLERS_BLOCKED', 'SOFT_404', 'MISSING_COMPRESSION', 'NO_LAZY_IMAGES', 'DUPLICATE_CONTENT', 'THIN_CONTENT', 'MISSING_ARTICLE_SCHEMA', 'STALE_CONTENT', 'POOR_READABILITY', 'SHORT_BLOG_POST', 'MISSING_AUTHOR');--> statement-breakpoint
CREATE TYPE "public"."issue_state" AS ENUM('OPEN', 'IGNORED', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('DEBUG', 'INFO', 'WARN', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."outbound_delivery_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'MEMBER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."schedule_frequency" AS ENUM('DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid,
	"user_id" uuid,
	"role" "role",
	"action" varchar(64) NOT NULL,
	"resource_type" varchar(32),
	"resource_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notify_on_score_drop" boolean DEFAULT true NOT NULL,
	"score_drop_threshold" integer DEFAULT 1 NOT NULL,
	"notify_on_new_critical_issues" boolean DEFAULT true NOT NULL,
	"notify_on_issue_count_increase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_rules_site_uk" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "audit_comparison_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comparison_id" uuid NOT NULL,
	"change_type" "comparison_change_type" NOT NULL,
	"issue_code" "issue_code",
	"issue_category" "issue_category",
	"severity" "severity",
	"title" varchar(200) NOT NULL,
	"delta" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"baseline_audit_run_id" uuid NOT NULL,
	"target_audit_run_id" uuid NOT NULL,
	"score_delta" integer DEFAULT 0 NOT NULL,
	"issues_delta" integer DEFAULT 0 NOT NULL,
	"regressions_count" integer DEFAULT 0 NOT NULL,
	"improvements_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_comparisons_runs_uk" UNIQUE("baseline_audit_run_id","target_audit_run_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"audit_run_id" uuid,
	"comparison_id" uuid,
	"kind" "export_kind" NOT NULL,
	"format" "export_format" NOT NULL,
	"status" "export_status" DEFAULT 'PENDING' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_name" varchar(255),
	"storage_path" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"issue_code" "issue_code" NOT NULL,
	"category" "issue_category" DEFAULT 'TECHNICAL' NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"resource_url" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"key" varchar(120) NOT NULL,
	"value_num" integer,
	"value_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"response_ms" integer,
	"content_type" varchar(128),
	"score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"trigger" "audit_trigger" NOT NULL,
	"status" "audit_status" DEFAULT 'QUEUED' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"http_status" integer,
	"response_ms" integer,
	"score" integer,
	"category_scores" jsonb,
	"score_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"project_id" uuid,
	"notification_type" varchar(80),
	"recipient_email" varchar(320) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text,
	"status" "email_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(255),
	"provider_response" text,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(64) NOT NULL,
	"job_name" varchar(120) NOT NULL,
	"job_id" varchar(120),
	"attempts" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"stack" text,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(80) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbound_webhook_id" uuid NOT NULL,
	"event" varchar(120) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbound_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"status_code" integer,
	"response_body" text,
	"error_message" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"header_name" varchar(120),
	"header_value" text,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_uk" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "project_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" "role" NOT NULL,
	"extra_permissions" text[] DEFAULT '{}' NOT NULL,
	"revoked_permissions" text[] DEFAULT '{}' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invites_token_hash_uk" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"extra_permissions" text[] DEFAULT '{}' NOT NULL,
	"revoked_permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_crawl_configs" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"max_pages" integer DEFAULT 50 NOT NULL,
	"max_depth" integer DEFAULT 2 NOT NULL,
	"max_concurrent_pages" integer DEFAULT 5 NOT NULL,
	"request_delay_ms" integer DEFAULT 0 NOT NULL,
	"respect_crawl_delay" boolean DEFAULT true NOT NULL,
	"user_agent" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"issue_code" "issue_code" NOT NULL,
	"resource_key" text DEFAULT '' NOT NULL,
	"category" "issue_category" DEFAULT 'TECHNICAL' NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"state" "issue_state" DEFAULT 'OPEN' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_audit_run_id" uuid,
	"last_seen_audit_run_id" uuid,
	"resolved_at" timestamp with time zone,
	"ignored_at" timestamp with time zone,
	"ignored_by_user_id" uuid,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_issues_fingerprint_uk" UNIQUE("site_id","issue_code","resource_key")
);
--> statement-breakpoint
CREATE TABLE "site_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"frequency" "schedule_frequency" NOT NULL,
	"day_of_week" integer,
	"time_of_day" varchar(5) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_schedules_site_uk" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"normalized_domain" varchar(255) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"public_badge_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_project_domain_uk" UNIQUE("project_id","normalized_domain")
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid,
	"level" "log_level" NOT NULL,
	"source" varchar(120) NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"active_project_id" uuid,
	"email_on_audit_completed" boolean DEFAULT true NOT NULL,
	"email_on_audit_regression" boolean DEFAULT true NOT NULL,
	"email_on_critical_issues" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"endpoint_key" varchar(120) NOT NULL,
	"endpoint_path" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_key_uk" UNIQUE("endpoint_key"),
	CONSTRAINT "webhook_endpoints_path_uk" UNIQUE("endpoint_path")
);
--> statement-breakpoint
CREATE TABLE "webhook_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"webhook_endpoint_id" uuid,
	"secret_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_comparison_changes" ADD CONSTRAINT "audit_comparison_changes_comparison_id_audit_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."audit_comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_comparisons" ADD CONSTRAINT "audit_comparisons_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_comparisons" ADD CONSTRAINT "audit_comparisons_baseline_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("baseline_audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_comparisons" ADD CONSTRAINT "audit_comparisons_target_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("target_audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_comparison_id_audit_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."audit_comparisons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_metrics" ADD CONSTRAINT "audit_metrics_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_deliveries" ADD CONSTRAINT "outbound_webhook_deliveries_outbound_webhook_id_outbound_webhooks_id_fk" FOREIGN KEY ("outbound_webhook_id") REFERENCES "public"."outbound_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_crawl_configs" ADD CONSTRAINT "site_crawl_configs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_issues" ADD CONSTRAINT "site_issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_issues" ADD CONSTRAINT "site_issues_first_seen_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("first_seen_audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_issues" ADD CONSTRAINT "site_issues_last_seen_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("last_seen_audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_issues" ADD CONSTRAINT "site_issues_ignored_by_user_id_users_id_fk" FOREIGN KEY ("ignored_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_schedules" ADD CONSTRAINT "site_schedules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_active_project_id_projects_id_fk" FOREIGN KEY ("active_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_secrets" ADD CONSTRAINT "webhook_secrets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_secrets" ADD CONSTRAINT "webhook_secrets_webhook_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_project_created_idx" ON "activity_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_site_idx" ON "activity_log" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "activity_log_user_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_comparison_changes_idx" ON "audit_comparison_changes" USING btree ("comparison_id","change_type");--> statement-breakpoint
CREATE INDEX "audit_comparisons_site_idx" ON "audit_comparisons" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "audit_events_run_idx" ON "audit_events" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_exports_user_idx" ON "audit_exports" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_exports_site_idx" ON "audit_exports" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "audit_exports_status_idx" ON "audit_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_issues_run_idx" ON "audit_issues" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_issues_severity_idx" ON "audit_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "audit_issues_category_idx" ON "audit_issues" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_issues_run_code_idx" ON "audit_issues" USING btree ("audit_run_id","issue_code");--> statement-breakpoint
CREATE INDEX "audit_metrics_run_idx" ON "audit_metrics" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_pages_run_idx" ON "audit_pages" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_runs_site_idx" ON "audit_runs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "audit_runs_status_idx" ON "audit_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_runs_site_created_idx" ON "audit_runs" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_runs_site_score_idx" ON "audit_runs" USING btree ("site_id","score");--> statement-breakpoint
CREATE INDEX "audit_runs_site_trigger_idx" ON "audit_runs" USING btree ("site_id","trigger");--> statement-breakpoint
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_deliveries_user_idx" ON "email_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_deliveries_project_idx" ON "email_deliveries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "email_deliveries_created_idx" ON "email_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_failures_queue_idx" ON "job_failures" USING btree ("queue_name");--> statement-breakpoint
CREATE INDEX "job_failures_failed_at_idx" ON "job_failures" USING btree ("failed_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "outbound_webhook_deliveries_webhook_idx" ON "outbound_webhook_deliveries" USING btree ("outbound_webhook_id");--> statement-breakpoint
CREATE INDEX "outbound_webhook_deliveries_created_idx" ON "outbound_webhook_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbound_webhooks_project_idx" ON "outbound_webhooks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_invites_project_idx" ON "project_invites" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_invites_email_idx" ON "project_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_issues_site_state_idx" ON "site_issues" USING btree ("site_id","state");--> statement-breakpoint
CREATE INDEX "site_issues_state_idx" ON "site_issues" USING btree ("state");--> statement-breakpoint
CREATE INDEX "sites_project_idx" ON "sites" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sites_project_name_idx" ON "sites" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "sites_project_domain_idx" ON "sites" USING btree ("project_id","normalized_domain");--> statement-breakpoint
CREATE INDEX "system_logs_run_idx" ON "system_logs" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "system_logs_level_idx" ON "system_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "system_logs_created_idx" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_project_idx" ON "webhook_endpoints" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "webhook_secrets_project_idx" ON "webhook_secrets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "webhook_secrets_endpoint_idx" ON "webhook_secrets" USING btree ("webhook_endpoint_id");