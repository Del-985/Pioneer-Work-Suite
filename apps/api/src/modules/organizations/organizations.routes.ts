import { Router } from 'express';
import { OrganizationsController } from './organizations.controller';

export const router = Router();
const controller = new OrganizationsController();

// GET /orgs
router.get('/', controller.list);

// POST /orgs
router.post('/', controller.create);