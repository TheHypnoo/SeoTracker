CREATE TABLE "audit_engine_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"stage" varchar(80) NOT NULL,
	"status" varchar(20) NOT NULL,
	"duration_ms" integer NOT NULL,
	"details" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_runs" ADD COLUMN "scoring_model_version" varchar(40);--> statement-breakpoint
ALTER TABLE "audit_runs" ADD COLUMN "seo_score" integer;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD COLUMN "crawl_confidence_score" integer;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD COLUMN "critical_risk" varchar(24);--> statement-breakpoint
ALTER TABLE "audit_engine_telemetry" ADD CONSTRAINT "audit_engine_telemetry_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_engine_telemetry_run_idx" ON "audit_engine_telemetry" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "audit_engine_telemetry_run_stage_idx" ON "audit_engine_telemetry" USING btree ("audit_run_id","stage");