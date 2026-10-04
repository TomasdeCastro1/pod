CREATE TYPE "public"."conformidad_nivel" AS ENUM('alto', 'medio', 'bajo');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('qr_o_ia', 'ia');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'miembro');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('procesando', 'listo', 'revisar', 'error');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_fields" (
	"company_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_fields_company_id_field_key_pk" PRIMARY KEY("company_id","field_key")
);
--> statement-breakpoint
CREATE TABLE "field_catalog" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"group" text NOT NULL,
	"doc_types" text[] NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"source" "source" NOT NULL,
	"instruction" text NOT NULL,
	"is_item_field" boolean DEFAULT false NOT NULL,
	"est_in_tokens" integer NOT NULL,
	"est_out_tokens" integer NOT NULL,
	"price_per_1000_usd" numeric(10, 4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"model" text PRIMARY KEY NOT NULL,
	"input_per_mtok_usd" numeric(10, 4) NOT NULL,
	"output_per_mtok_usd" numeric(10, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"base_price_per_1000_usd" numeric(10, 4) DEFAULT '40' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"replaces_scan_id" uuid,
	"captured_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"image_key" text,
	"thumb_key" text,
	"status" "status" DEFAULT 'procesando' NOT NULL,
	"error_message" text,
	"qr_raw" text,
	"qr_data" jsonb,
	"qr_parcial" boolean DEFAULT false NOT NULL,
	"doc_type" text,
	"extracted" jsonb,
	"corrections" jsonb,
	"fields_requested" text[],
	"cliente_rut" text,
	"cliente_nombre" text,
	"local" text,
	"numero" text,
	"serie" text,
	"fecha_documento" text,
	"total" numeric(12, 2),
	"conformidad_nivel" "conformidad_nivel",
	"sello_texto" text,
	"model_used" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"ai_cost_usd" numeric(12, 6),
	"price_per_1000_snapshot" numeric(10, 4),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fields" ADD CONSTRAINT "company_fields_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fields" ADD CONSTRAINT "company_fields_field_key_field_catalog_key_fk" FOREIGN KEY ("field_key") REFERENCES "public"."field_catalog"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fields" ADD CONSTRAINT "company_fields_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_replaces_scan_id_scans_id_fk" FOREIGN KEY ("replaces_scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_invite_code_uq" ON "companies" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "scans_client_id_uq" ON "scans" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "scans_company_captured_idx" ON "scans" USING btree ("company_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_cliente_rut_idx" ON "scans" USING btree ("cliente_rut");--> statement-breakpoint
CREATE INDEX "scans_numero_idx" ON "scans" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "scans_conformidad_idx" ON "scans" USING btree ("conformidad_nivel");--> statement-breakpoint
CREATE INDEX "scans_search_idx" ON "scans" USING gin (to_tsvector('spanish', coalesce("cliente_nombre", '') || ' ' || coalesce("local", '') || ' ' || coalesce("sello_texto", '')));