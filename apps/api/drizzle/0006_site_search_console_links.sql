CREATE TABLE "site_search_console_links" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"search_console_property_id" uuid NOT NULL,
	"linked_by_user_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_search_console_links" ADD CONSTRAINT "site_search_console_links_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_search_console_links" ADD CONSTRAINT "site_search_console_links_search_console_property_id_search_console_properties_id_fk" FOREIGN KEY ("search_console_property_id") REFERENCES "public"."search_console_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_search_console_links" ADD CONSTRAINT "site_search_console_links_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_search_console_links_property_idx" ON "site_search_console_links" USING btree ("search_console_property_id");--> statement-breakpoint
CREATE INDEX "site_search_console_links_user_idx" ON "site_search_console_links" USING btree ("linked_by_user_id");
