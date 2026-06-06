CREATE TABLE "search_console_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"google_connection_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"permission_level" varchar(80) NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_properties_connection_url_uk" UNIQUE("google_connection_id","site_url")
);
--> statement-breakpoint
ALTER TABLE "search_console_properties" ADD CONSTRAINT "search_console_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_properties" ADD CONSTRAINT "search_console_properties_google_connection_id_google_oauth_connections_id_fk" FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_oauth_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_console_properties_project_idx" ON "search_console_properties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "search_console_properties_connection_idx" ON "search_console_properties" USING btree ("google_connection_id");
