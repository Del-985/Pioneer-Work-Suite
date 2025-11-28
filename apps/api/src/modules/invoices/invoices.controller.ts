import type { Request, Response, NextFunction } from 'express';
import { InvoicesService } from './invoices.service';

const service = new InvoicesService();

export class InvoicesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.params.orgId;
      const invoices = await service.list(orgId);
      res.json(invoices);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.params.orgId;
      const invoiceInput = req.body;
      const invoice = await service.create(orgId, invoiceInput);
      res.status(201).json(invoice);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { orgId, invoiceId } = req.params;
      const invoice = await service.getById(orgId, invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Not found' });
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { orgId, invoiceId } = req.params;
      const invoiceInput = req.body;
      const invoice = await service.update(orgId, invoiceId, invoiceInput);
      res.json(invoice);
    } catch (err) {
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const { orgId, invoiceId } = req.params;
      await service.remove(orgId, invoiceId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}