import { Router } from 'express';
import { InvoicesController } from './invoices.controller';

export const router = Router();
const controller = new InvoicesController();

// /orgs/:orgId/invoices
router.get('/:orgId/invoices', controller.list);
router.post('/:orgId/invoices', controller.create);

router.get('/:orgId/invoices/:invoiceId', controller.getById);
router.put('/:orgId/invoices/:invoiceId', controller.update);
router.delete('/:orgId/invoices/:invoiceId', controller.remove);