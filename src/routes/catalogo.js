import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /api/catalogo/modelos - Busca modelos de moto ativos com estoque
router.get('/modelos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('modelos_disponiveis')
            .select('*')
            .eq('ativo', true);

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/catalogo/planos - Busca planos de aluguel por modelo
router.get('/planos', async (req, res) => {
    try {
        const { modelo } = req.query;

        let query = supabase.from('planos').select('*').eq('ativo', true);
        if (modelo) query = query.eq('modelo_nome', modelo);

        const { data, error } = await query;
        if (error) throw error;

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;