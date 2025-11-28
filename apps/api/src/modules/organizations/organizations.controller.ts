import type { Request, Response, NextFunction } from 'express';
import { OrganizationsService } from './organizations.service';

const service = new OrganizationsService();

export class OrganizationsController {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const orgs = await service.list();
      res.json(orgs);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name } = req.body;
      const org = await service.create({ name });
      res.status(201).json(org);
    } catch (err) {
      next(err);
    }
  }
}