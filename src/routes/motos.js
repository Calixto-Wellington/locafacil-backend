import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /api/motos - Listar todas as motos da frota
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('motos_frota')
            .select('*, modelos_catalogo(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/motos - Cadastrar nova moto física no pátio
router.post('/', async (req, res) => {
    try {
        const { marca, modelo, cor, ano, placa, km_atual, status } = req.body;

        if (!marca || !modelo || !placa) {
            return res.status(400).json({ error: 'Marca, modelo e placa são obrigatórios.' });
        }

        // 1. Busca se o modelo já existe no catálogo comercial
        let { data: modExistente } = await supabase
            .from('modelos_catalogo')
            .select('id')
            .ilike('marca', marca)
            .ilike('modelo', modelo)
            .maybeSingle();

        let modeloId = modExistente?.id;

        // 2. Se o modelo não existir no catálogo, cria incluindo o nome_modelo (ex: "Honda CG 160 Start")
        if (!modeloId) {
            const { data: novoMod, error: errMod } = await supabase
                .from('modelos_catalogo')
                .insert([{
                    nome_modelo: `${marca} ${modelo}`,
                    marca: marca,
                    modelo: modelo,
                    categoria: 'Urbana / Delivery',
                    ativo_vitrine: true
                }])
                .select()
                .single();

            if (errMod) throw errMod;
            modeloId = novoMod.id;
        }

        // 3. Insere a moto física em motos_frota
        const { data, error } = await supabase
            .from('motos_frota')
            .insert([{
                modelo_id: modeloId,
                marca: marca,
                modelo: modelo,
                cor: cor || 'Preta',
                ano: parseInt(ano) || 2025,
                placa: placa.toUpperCase(),
                km_atual: parseInt(km_atual) || 0,
                status: status || 'DISPONIVEL'
            }])
            .select();

        if (error) throw error;
        return res.status(201).json(data);

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;