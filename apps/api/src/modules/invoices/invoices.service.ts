import type { Invoice } from '@shared/models/Invoice';

let invoices: Invoice[] = [];
let invoiceIdCounter = 1;

export class InvoicesService {
  async list(orgId: string): Promise<Invoice[]> {
    return invoices.filter((inv) => inv.orgId === orgId);
  }

  async create(orgId: string, input: Partial<Invoice>): Promise<Invoice> {
    const invoice: Invoice = {
      id: String(invoiceIdCounter++),
      orgId,
      invoiceNumber: input.invoiceNumber ?? `INV-${invoiceIdCounter}`,
      customerName: input.customerName ?? 'Unnamed customer',
      customerEmail: input.customerEmail,
      issueDate: input.issueDate ?? new Date().toISOString(),
      dueDate: input.dueDate,
      currency: input.currency ?? 'USD',
      status: input.status ?? 'draft',
      lineItems: input.lineItems ?? [],
      notes: input.notes,
      total: input.total ?? 0,
    };

    invoices.push(invoice);
    return invoice;
  }

  async getById(orgId: string, invoiceId: string): Promise<Invoice | undefined> {
    return invoices.find((inv) => inv.orgId === orgId && inv.id === invoiceId);
  }

  async update(
    orgId: string,
    invoiceId: string,
    input: Partial<Invoice>
  ): Promise<Invoice> {
    const idx = invoices.findIndex(
      (inv) => inv.orgId === orgId && inv.id === invoiceId
    );
    if (idx === -1) {
      const err = new Error('Invoice not found') as any;
      err.status = 404;
      throw err;
    }

    const existing = invoices[idx];
    const updated: Invoice = {
      ...existing,
      ...input,
      id: existing.id,
      orgId: existing.orgId,
    };

    invoices[idx] = updated;
    return updated;
  }

  async remove(orgId: string, invoiceId: string): Promise<void> {
    invoices = invoices.filter(
      (inv) => !(inv.orgId === orgId && inv.id === invoiceId)
    );
  }
}