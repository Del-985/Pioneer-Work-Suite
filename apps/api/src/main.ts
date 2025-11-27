import './config/env'; // load env vars
import express from 'express';
import cors from 'cors';

import { errorHandler } from './middleware/errorHandler';
import { router as healthRouter } from './modules/health/health.routes';
import { router as authRouter } from './modules/auth/auth.routes';
import { router as organizationsRouter } from './modules/organizations/organizations.routes';
import { router as invoicesRouter } from './modules/invoices/invoices.routes';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/orgs', organizationsRouter);
app.use('/orgs', invoicesRouter); // e.g. /orgs/:orgId/invoices

// Error handler (must be last)
app.use(errorHandler);

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});