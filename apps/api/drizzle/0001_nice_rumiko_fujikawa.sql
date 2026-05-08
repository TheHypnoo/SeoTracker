CREATE TYPE "public"."indexability_status" AS ENUM('INDEXABLE', 'NOINDEX', 'BLOCKED_BY_ROBOTS', 'CANONICALIZED', 'HTTP_ERROR', 'PRIVATE_EXPECTED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."seo_action_effort" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."seo_action_impact" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TABLE "audit_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"issue_code" "issue_code" NOT NULL,
	"category" "issue_category" DEFAULT 'TECHNICAL' NOT NULL,
	"severity" "severity" NOT NULL,
	"priority_score" integer NOT NULL,
	"impact" "seo_action_impact" NOT NULL,
	"effort" "seo_action_effort" NOT NULL,
	"score_impact_points" integer NOT NULL,
	"occurrences" integer NOT NULL,
	"affected_pages_count" integer NOT NULL,
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_summary" text NOT NULL,
	"priority_reason" text NOT NULL,
	"recommended_action" text NOT NULL,
	"remediation_prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_action_items_run_code_uk" UNIQUE("audit_run_id","issue_code")
);
--> statement-breakpoint
CREATE TABLE "audit_url_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"source" varchar(40) NOT NULL,
	"status_code" integer,
	"indexability_status" "indexability_status" NOT NULL,
	"canonical_url" text,
	"robots_directive" text,
	"x_robots_tag" text,
	"sitemap_included" boolean DEFAULT false NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_metrics" ALTER COLUMN "value_num" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "audit_action_items" ADD CONSTRAINT "audit_action_items_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_url_inspections" ADD CONSTRAINT "audit_url_inspections_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_action_items_run_idx" ON "audit_action_items" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_action_items_priority_idx" ON "audit_action_items" USING btree ("audit_run_id","priority_score");--> statement-breakpoint
CREATE INDEX "audit_url_inspections_run_idx" ON "audit_url_inspections" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_url_inspections_status_idx" ON "audit_url_inspections" USING btree ("audit_run_id","indexability_status");--> statement-breakpoint
CREATE INDEX "audit_url_inspections_source_idx" ON "audit_url_inspections" USING btree ("audit_run_id","source");