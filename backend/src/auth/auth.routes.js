import { Router } from 'express';
import * as controller from './auth.controller.js';

const router = Router();

router.get('/login', controller.login);
router.get('/callback', controller.callback);
router.get('/status', controller.status);
router.post('/logout', controller.logout);

export default router;
