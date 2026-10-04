import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'miembro']);
export const scanStatusEnum = pgEnum('status', ['procesando', 'listo', 'revisar', 'error']);
export const conformidadNivelEnum = pgEnum('conformidad_nivel', ['completa', 'firma_sola', 'dudosa', 'sin_firma']);
export const fieldSourceEnum = pgEnum('source', ['qr_o_ia', 'ia', 'qr']);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  nombre: text('nombre'),
  createdAt: ts('created_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const otpCodes = pgTable('otp_codes', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    rut: text('rut').notNull(),
    inviteCode: text('invite_code').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('companies_invite_code_uq').on(t.inviteCode)],
);

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    role: roleEnum('role').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const fieldCatalog = pgTable('field_catalog', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  group: text('group').notNull(),
  docTypes: text('doc_types').array().notNull(),
  isBase: boolean('is_base').notNull().default(false),
  source: fieldSourceEnum('source').notNull(),
  instruction: text('instruction').notNull(),
  isItemField: boolean('is_item_field').notNull().default(false),
  estInTokens: integer('est_in_tokens').notNull(),
  estOutTokens: integer('est_out_tokens').notNull(),
  pricePer1000Usd: numeric('price_per_1000_usd', { precision: 10, scale: 4 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const companyFields = pgTable(
  'company_fields',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    fieldKey: text('field_key')
      .notNull()
      .references(() => fieldCatalog.key),
    enabled: boolean('enabled').notNull().default(false),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.fieldKey] })],
);

export const priceSettings = pgTable('price_settings', {
  id: integer('id').primaryKey().default(1),
  basePricePer1000Usd: numeric('base_price_per_1000_usd', { precision: 10, scale: 4 })
    .notNull()
    .default('40'),
  currency: text('currency').notNull().default('USD'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const modelPrices = pgTable('model_prices', {
  model: text('model').primaryKey(),
  inputPerMtokUsd: numeric('input_per_mtok_usd', { precision: 10, scale: 4 }).notNull(),
  outputPerMtokUsd: numeric('output_per_mtok_usd', { precision: 10, scale: 4 }).notNull(),
});

export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // Decisión 8 del plan: el reescaneo apunta al escaneo que reemplaza.
    replacesScanId: uuid('replaces_scan_id').references((): AnyPgColumn => scans.id),

    capturedAt: ts('captured_at').notNull(),
    uploadedAt: ts('uploaded_at').notNull().defaultNow(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),

    imageKey: text('image_key'),
    thumbKey: text('thumb_key'),

    status: scanStatusEnum('status').notNull().default('procesando'),
    errorMessage: text('error_message'),

    qrRaw: text('qr_raw'),
    qrData: jsonb('qr_data').$type<Record<string, unknown>>(),
    qrParcial: boolean('qr_parcial').notNull().default(false),

    docType: text('doc_type'),
    extracted: jsonb('extracted').$type<Record<string, unknown>>(),
    corrections: jsonb('corrections').$type<Record<string, unknown>>(),
    fieldsRequested: text('fields_requested').array(),

    clienteRut: text('cliente_rut'),
    clienteNombre: text('cliente_nombre'),
    local: text('local'),
    numero: text('numero'),
    serie: text('serie'),
    fechaDocumento: text('fecha_documento'),
    total: numeric('total', { precision: 12, scale: 2 }),
    conformidadNivel: conformidadNivelEnum('conformidad_nivel'),
    selloTexto: text('sello_texto'),

    modelUsed: text('model_used'),
    escalated: boolean('escalated').notNull().default(false),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    aiCostUsd: numeric('ai_cost_usd', { precision: 12, scale: 6 }),
    pricePer1000Snapshot: numeric('price_per_1000_snapshot', { precision: 10, scale: 4 }),

    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: ts('reviewed_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    uniqueIndex('scans_client_id_uq').on(t.clientId),
    index('scans_company_captured_idx').on(t.companyId, t.capturedAt.desc()),
    index('scans_cliente_rut_idx').on(t.clienteRut),
    index('scans_numero_idx').on(t.numero),
    index('scans_conformidad_idx').on(t.conformidadNivel),
    // Búsqueda de texto: índice GIN sobre to_tsvector('spanish', ...) en lugar de pg_trgm,
    // porque no requiere extensión (PGlite y Replit la traen o no según el caso) y alcanza
    // para buscar por palabras. La búsqueda debe usar exactamente esta expresión.
    index('scans_search_idx').using(
      'gin',
      sql`to_tsvector('spanish', coalesce(${t.clienteNombre}, '') || ' ' || coalesce(${t.local}, '') || ' ' || coalesce(${t.selloTexto}, ''))`,
    ),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  createdAt: ts('created_at').notNull().defaultNow(),
});
