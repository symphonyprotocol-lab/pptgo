CREATE TABLE "deckShare" (
	"id" text PRIMARY KEY NOT NULL,
	"deckId" text NOT NULL,
	"ownerId" text NOT NULL,
	"token" text NOT NULL,
	"mode" text DEFAULT 'read' NOT NULL,
	"passwordHash" text,
	"passwordSalt" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deckShare_deckId_unique" UNIQUE("deckId"),
	CONSTRAINT "deckShare_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "deckShare" ADD CONSTRAINT "deckShare_deckId_deck_id_fk" FOREIGN KEY ("deckId") REFERENCES "public"."deck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deckShare" ADD CONSTRAINT "deckShare_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deckShare_owner_idx" ON "deckShare" USING btree ("ownerId");