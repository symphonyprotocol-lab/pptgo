CREATE TABLE "apiToken" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"prefix" text NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apiToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "apiToken" ADD CONSTRAINT "apiToken_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apiToken_owner_idx" ON "apiToken" USING btree ("ownerId");