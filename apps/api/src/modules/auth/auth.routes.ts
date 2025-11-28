import { Router } from 'express';
import { AuthController } from './auth.controller';

export const router = Router();
const controller = new AuthController();

// POST /auth/register
router.post('/register', controller.register);

// POST /auth/login
router.post('/login', controller.login);

// GET /auth/me
router.get('/me', controller.me);