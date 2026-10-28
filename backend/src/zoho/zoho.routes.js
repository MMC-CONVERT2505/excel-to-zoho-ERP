import { Router } from 'express';
import { callZoho } from './zoho.service.js';

const router = Router();

// /api/zoho/<path>  ->  https://www.zohoapis.in/erp/v3/<path>
router.all('/*', async (req, res) => {
  try {
    const { status, data } = await callZoho({
      method: req.method,
      path: req.params[0],
      query: req.query,
      body: req.body,
    });
    res.status(status).json(data);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

export default router;
