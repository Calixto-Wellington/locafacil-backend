import { Router } from 'express';
import { listarMotosDisponiveis, listarPlanosPorModelo } from '../controllers/agendamentoController.js';

const router = Router();

router.get('/motos-disponiveis', listarMotosDisponiveis);
router.get('/planos/:modelo', listarPlanosPorModelo);

export default router;