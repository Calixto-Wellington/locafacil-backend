import { Router } from 'express';
import { listarMotos } from '../controllers/motoController.js';

const router = Router();

router.get('/', listarMotos);

export default router;