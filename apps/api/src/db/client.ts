// Placeholder for your real DB client.
// Later you can replace this with Prisma, Knex, or any ORM/driver.

export interface DbClient {
  // e.g., invoices: InvoiceRepository;
  // auth: AuthRepository;
}

export const db: DbClient = {};