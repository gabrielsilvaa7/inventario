# Segurança e governança — revisão obrigatória da TI

1. **GitHub Pages é público por padrão**. Não faça commit de estoque, valores, usernames/senhas reais, tokens, IDs internos sensíveis, chaves ou Script Properties. O frontend e a ponte são públicos; os dados devem permanecer em planilha privada.
2. **Implantação Apps Script 'executar como eu'** é uma conta privilegiada. Todo método que acessa dados necessita autenticação e autorização server-side. Revise alterações antes de republicar uma nova versão.
3. **WEB_ORIGIN** limita a comunicação browser/iframe à origem cadastrada. `https://usuario.github.io` abrange repositórios do mesmo usuário; preferir domínio dedicado quando possível. O canal aleatório reduz confusão entre instâncias, mas não substitui autenticação.
4. **Senhas**: este MVP usa salt único, segredo privado (AUTH_PEPPER) e múltiplas iterações de SHA-256. Isso NÃO é substituto auditado de Argon2id, bcrypt ou PBKDF2 robusto; uma autenticação corporativa com MFA e revogação é preferível.
5. **Sessões**: token opaco transmitido por `postMessage` para o bridge autorizado; apenas hash armazenado na aba SESSOES; duração 8 horas, revogável no logout; aba só com permissão de proprietário. O navegador guarda token na sessão, de modo que um XSS pode roubá-lo — mantenha escaping e revisão de dependências.
6. **Permissões**: contadores não têm acesso ao saldo/valor SAP no backend. Supervisor vê dashboard/aprovações; administrador também cria usuários. **Nunca compartilhe o banco do Sheets com contadores**. Revise acesso ao arquivo e ao Apps Script.
7. **Brute force**: o backend limita falhas por usuário no CacheService por 15 minutos; não substitui WAF/limite por IP. Use senhas longas.
8. **Contagens**: o sistema não impede dois contadores de lançar o mesmo endereço, por decisão operacional. Treine e coordene a cobertura física.
9. **Auditoria**: loga operações relevantes; não armazena senha em auditoria. Avalie armazenar logs imutáveis fora da própria planilha para maior garantia forense.
10. **Continuidade**: Sheets e Apps Script têm cotas/limites e podem apresentar falhas. Faça testes de carga na rede e dispositivos de campo; tenha plano offline/manual e cópia de segurança.
11. **Conformidade**: valide políticas da empresa, LGPD, retenção, tratamento de informação comercial/fiscal e autorização para serviços pessoais Google/GitHub antes do uso produtivo.
12. **Escopo SAP**: confirme se bloqueado, trânsito, transferência, depósitos virtuais ou estoques especiais pertencem à contagem. Não aprove ajuste sem processo formal SAP e conciliação.
13. **Fechamento multi-linhas**: operação no Sheets não é ACID. Para produção, desenvolver proteção contra execução interrompida, estado intermediário e recuperação automática, ou migrar resultados/transações para banco transacional.
