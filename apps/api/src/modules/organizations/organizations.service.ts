import type { Organization } from '@shared/models/Organization';

interface CreateOrgInput {
  name: string;
}

let orgs: Organization[] = [];
let orgIdCounter = 1;

export class OrganizationsService {
  async list(): Promise<Organization[]> {
    return orgs;
  }

  async create(input: CreateOrgInput): Promise<Organization> {
    const org: Organization = {
      id: String(orgIdCounter++),
      name: input.name,
    };
    orgs.push(org);
    return org;
  }
}