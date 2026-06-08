WITH ranked_pending_invites AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "project_id", "email"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS invite_rank
  FROM "project_invites"
  WHERE "accepted_at" IS NULL
)
DELETE FROM "project_invites"
USING ranked_pending_invites
WHERE "project_invites"."id" = ranked_pending_invites."id"
  AND ranked_pending_invites.invite_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_invites_project_email_pending_uk" ON "project_invites" USING btree ("project_id", "email") WHERE "accepted_at" IS NULL;
