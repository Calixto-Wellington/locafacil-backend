import { Router } from 'express';
import multer from 'multer';
import { salvarCadastro } from '../controllers/cadastroController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.fields([
    { name: 'cnh', maxCount: 1 },
    { name: 'comprovante', maxCount: 1 } // Nome ajustado para 'comprovante'
]), salvarCadastro);

export default router;