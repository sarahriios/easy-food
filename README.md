```markdown
# EasyFood API

API de restaurantes construída com Node.js, Express, Prisma e PostgreSQL.
Autenticação via JWT.

## Como rodar

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie o arquivo `.env` a partir do `.env.example` e preencha os valores.

3. Rode as migrations:
   ```bash
   npx prisma migrate dev
   ```

4. Inicie o servidor:
   ```bash
   node server.js
   ```

## Endpoints

- `GET  /restaurants` — lista restaurantes (público)
- `POST /restaurants` — cadastra restaurante (exige token)
- `POST /auth/register` — cadastra usuário
- `POST /auth/login` — faz login e devolve um token JWT
- `GET  /auth/me` — dados do usuário logado (exige token)
## Imagens (Atividade 8)

- `POST /auth/me/image` — foto do perfil do usuário autenticado (exige token; campo `image`)
- `POST /dishes/:dishId/image` — foto de um prato (exige token do dono do restaurante; campo `image`)
- `GET  /uploads/...` — acesso às imagens salvas

Formatos: JPEG, PNG ou WebP, até 5 MB. As imagens são otimizadas com Sharp (WebP) pelo serviço compartilhado `src/modules/shared/image.service.js`.
Testes: `npm test`. Detalhes em `docs/ATIVIDADE-8.md`.
