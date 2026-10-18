import { supabase } from '../config/supabase.js';

export const listarMotosDisponiveis = async (req, res) => {
    try {
        // 1. Consulta as motos físicas com status DISPONIVEL
        const { data: motosDisponiveis, error: errFrota } = await supabase
            .from('motos_frota')
            .select('*')
            .ilike('status', 'DISPONIVEL');

        if (errFrota) throw errFrota;

        if (!motosDisponiveis || motosDisponiveis.length === 0) {
            return res.json([]);
        }

        // 2. Consulta o catálogo de modelos para obter imagens e nomes bonitos
        const { data: modelosCatalogo } = await supabase
            .from('modelos_catalogo')
            .select('*');

        const modelosAgrupados = {};

        motosDisponiveis.forEach(moto => {
            const chaveModelo = moto.modelo_id || moto.modelo || moto.marca;
            if (!modelosAgrupados[chaveModelo]) {
                const infoCatalogo = (modelosCatalogo || []).find(c => 
                    c.id === moto.modelo_id || 
                    (c.nome_modelo && moto.modelo && c.nome_modelo.toLowerCase().includes(moto.modelo.toLowerCase()))
                );

                modelosAgrupados[chaveModelo] = {
                    nomeExibicao: infoCatalogo?.nome_modelo || `${moto.marca || ''} ${moto.modelo || ''}`.trim(),
                    marca: infoCatalogo?.marca || moto.marca || 'MOTO',
                    modelo: infoCatalogo?.modelo || moto.modelo || 'SÉRIE',
                    imagemUrl: infoCatalogo?.imagem_url || 'https://placehold.co/600x400?text=LOCAFACILMOTOS',
                    quantidade: 0
                };
            }
            modelosAgrupados[chaveModelo].quantidade++;
        });

        return res.json(Object.values(modelosAgrupados));
    } catch (error) {
        console.error('Erro ao buscar estoque de motos:', error.message);
        return res.status(500).json({ error: 'Erro interno ao consultar estoque.' });
    }
};

export const listarPlanosPorModelo = async (req, res) => {
    try {
        const { modelo } = req.params;

        const { data: planosFiltrados, error } = await supabase
            .from('planos')
            .select('*')
            .ilike('modelo_nome', `%${modelo}%`)
            .eq('ativo', true)
            .order('valor_semanal', { ascending: false });

        if (error) throw error;

        return res.json(planosFiltrados || []);
    } catch (error) {
        console.error('Erro ao buscar planos:', error.message);
        return res.status(500).json({ error: 'Erro interno ao buscar planos.' });
    }
};