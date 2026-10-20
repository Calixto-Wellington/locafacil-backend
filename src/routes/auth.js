import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'locafacil_secret_key_2026';

// Middleware de autenticação de Token
export const autenticarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
        req.usuario = usuario;
        next();
    });
};

// Middleware exclusivo para ADMIN
export const apenasAdmin = (req, res, next) => {
    if (req.usuario?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
};

// 1. Rota de Login
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const { data: usuario, error } = await supabase
            .from('usuarios_admin')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .eq('ativo', true)
            .maybeSingle();

        if (error || !usuario) return res.status(400).json({ error: 'Usuário ou senha inválidos.' });

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(400).json({ error: 'Usuário ou senha inválidos.' });

        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ success: true, token, usuario: { nome: usuario.nome, role: usuario.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Rota de Listagem de Usuários (Apenas ADMIN)
router.get('/usuarios', autenticarToken, apenasAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios_admin')
            .select('id, nome, email, role, ativo, created_at');

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Rota de Cadastro de Novo Usuário (Apenas ADMIN)
router.post('/usuarios', autenticarToken, apenasAdmin, async (req, res) => {
    try {
        const { nome, email, senha, role } = req.body;
        const senha_hash = await bcrypt.hash(senha, 10);

        const { error } = await supabase.from('usuarios_admin').insert([{
            nome, 
            email: email.toLowerCase().trim(), 
            senha_hash, 
            role: role || 'OPERADOR',
            ativo: true
        }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Rota de Exclusão/Remoção de Usuário (Apenas ADMIN)
router.delete('/usuarios/:id', autenticarToken, apenasAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('usuarios_admin')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rota de Emergência para criar/resetar o Admin via navegador
router.get('/setup-admin-emergencia', async (req, res) => {
    try {
        const emailMaster = 'financeiro@locafacilmotos.com.br';
        const senhaPlana = 'Admin123!';
        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senhaPlana, salt);

        const { data: existente } = await supabase
            .from('usuarios_admin')
            .select('*')
            .eq('email', emailMaster)
            .maybeSingle();

        if (existente) {
            await supabase
                .from('usuarios_admin')
                .update({ senha_hash, role: 'ADMIN', ativo: true })
                .eq('email', emailMaster);
            return res.json({ success: true, mensagem: 'Senha do admin atualizada com sucesso!' });
        } else {
            await supabase
                .from('usuarios_admin')
                .insert([{
                    nome: 'Wellington Simplicio',
                    email: emailMaster,
                    senha_hash,
                    role: 'ADMIN',
                    ativo: true
                }]);
            return res.json({ success: true, mensagem: 'Admin criado com sucesso!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;