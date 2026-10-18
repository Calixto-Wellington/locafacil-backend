import { supabase } from '../config/supabase.js';

export const salvarCadastro = async (req, res) => {
    try {
        const { nome, cpf, data_nascimento, email, telefone, endereco, moto, plano } = req.body;
        const files = req.files;

        if (!files || !files['cnh'] || !files['comprovante']) {
            return res.status(400).json({ error: 'Os arquivos de CNH e comprovante de endereço são obrigatórios.' });
        }

        const fileCnh = files['cnh'][0];
        const fileEnd = files['comprovante'][0];

        // 1. Upload da CNH para o Storage do Supabase (Bucket 'frota')
        const cnhFileName = `cnh_${Date.now()}_${fileCnh.originalname}`;
        const { error: errUploadCnh } = await supabase.storage
            .from('frota')
            .upload(cnhFileName, fileCnh.buffer, { contentType: fileCnh.mimetype });

        if (errUploadCnh) throw errUploadCnh;

        const { data: publicUrlCnh } = supabase.storage
            .from('frota')
            .getPublicUrl(cnhFileName);

        // 2. Upload do Comprovante para o Storage do Supabase (Bucket 'frota')
        const endFileName = `end_${Date.now()}_${fileEnd.originalname}`;
        const { error: errUploadEnd } = await supabase.storage
            .from('frota')
            .upload(endFileName, fileEnd.buffer, { contentType: fileEnd.mimetype });

        if (errUploadEnd) throw errUploadEnd;

        const { data: publicUrlEnd } = supabase.storage
            .from('frota')
            .getPublicUrl(endFileName);

        // 3. Inserção na tabela exata 'cadastros_funil'
        const { error: errDb } = await supabase
            .from('cadastros_funil')
            .insert([
                {
                    nome,
                    cpf,
                    data_nascimento,
                    email,
                    telefone,
                    endereco,
                    moto_interesse: moto,
                    plano_interesse: plano, // Mapeado exatamente com o nome da sua coluna
                    cnh_url: publicUrlCnh.publicUrl,
                    comprovante_url: publicUrlEnd.publicUrl,
                    possui_caucao: true,
                    status: 'PENDENTE'
                }
            ]);

        if (errDb) throw errDb;

        // Nota: O seu Trigger do Supabase para o Make.com vai disparar sozinho automaticamente após este insert!

        return res.status(200).json({ success: true, message: 'Cadastro enviado com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar cadastro:', error.message);
        return res.status(500).json({ error: 'Erro interno ao processar o cadastro.' });
    }
};