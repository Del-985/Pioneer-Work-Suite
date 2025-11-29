export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface Invoice {
  id: string;
  orgId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  issueDate: string;  // ISO date string
  dueDate?: string;
  currency: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  notes?: string;
  total: number;
}