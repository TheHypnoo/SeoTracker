CREATE TABLE "google_oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"google_account_email" varchar(320) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_oauth_connections" ADD CONSTRAINT "google_oauth_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_oauth_connections" ADD CONSTRAINT "google_oauth_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_oauth_connections_project_idx" ON "google_oauth_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "google_oauth_connections_user_idx" ON "google_oauth_connections" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "google_oauth_connections_email_idx" ON "google_oauth_connections" USING btree ("google_account_email");
