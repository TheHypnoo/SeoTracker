CREATE TABLE "gsc_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"search_console_property_id" uuid NOT NULL,
	"date" date NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"country" varchar(8) DEFAULT '' NOT NULL,
	"device" varchar(32) DEFAULT '' NOT NULL,
	"search_type" varchar(32) DEFAULT 'web' NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" double precision DEFAULT 0 NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_daily_stats_unique_row_uk" UNIQUE("site_id","search_console_property_id","date","query","page","country","device","search_type")
);
--> statement-breakpoint
ALTER TABLE "gsc_daily_stats" ADD CONSTRAINT "gsc_daily_stats_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_daily_stats" ADD CONSTRAINT "gsc_daily_stats_search_console_property_id_search_console_properties_id_fk" FOREIGN KEY ("search_console_property_id") REFERENCES "public"."search_console_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gsc_daily_stats_site_date_idx" ON "gsc_daily_stats" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "gsc_daily_stats_property_date_idx" ON "gsc_daily_stats" USING btree ("search_console_property_id","date");--> statement-breakpoint
CREATE INDEX "gsc_daily_stats_site_query_idx" ON "gsc_daily_stats" USING btree ("site_id","query");--> statement-breakpoint
CREATE INDEX "gsc_daily_stats_site_page_idx" ON "gsc_daily_stats" USING btree ("site_id","page");
