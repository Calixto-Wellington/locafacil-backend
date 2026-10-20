import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js'; // Ajuste o caminho do supabase conforme seu projeto

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'locafacil_secret_key_2026';

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

export default router;