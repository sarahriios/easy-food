# Atividade 8 — Evoluindo a EasyFood

Aluna: Sarah Emilly Profeta Evangelista Carvalho · RA 56414

Entregas: (1) cadastro de pratos funcionando após a correção, (2) upload de imagem do perfil do usuário autenticado, (3) upload de imagem de prato.

---

## Parte 1 — O bug do cadastro de pratos

### 1. Repositório atualizado
Base: `github.com/FelipeDiasR/easy-food`. A correção está no commit `70e459e` ("fix at creat menu"), sobre o commit `e9bc82c` (módulo de pratos).

### 2. Arquivos alterados pela correção (`git show 70e459e --stat`)

| Arquivo | O que mudou |
|---|---|
| `prisma/schema.prisma` | `Restaurant` ganhou `ownerId` + relação com `User`; `User` ganhou `restaurants Restaurant[]` |
| `prisma/migrations/20261029223849_add_restaurant_owner/migration.sql` | **novo**: coluna `ownerId INTEGER NOT NULL` + chave estrangeira para `User` |
| `src/modules/restaurant/restaurant.service.js` | `createRestaurant` grava `ownerId: user.id` (usuário do token) |
| `src/modules/restaurant/restaurant.controller.js` | só formatação |
| `src/modules/dishes/dish.service.js` | reescrito: `validateDish`, `parseId`, `ensureOwnership`, `getDishWithRestaurant`; `imageUrl: ""` na criação |
| `src/modules/dishes/dish.controller.js` | passa `req.user.id` ao service em criar, atualizar e remover |

### 3. O que causava o erro
Comparando o `createDish` antes e depois (o enunciado não descreve o sintoma exato; esta análise vem do diff):

1. **Exigência de `imageUrl` no corpo.** A versão antiga rejeitava com `400 "Campos obrigatórios: name, category, price, imageUrl, description"` qualquer prato sem `imageUrl`. Mas a imagem agora é enviada *depois* (Atividade 8): o prato precisa existir antes de receber foto. Quem tentava cadastrar um prato sem foto levava 400.
2. **Validação frouxa.** `if (!description)` recusava descrição vazia (`""`) e o `price` ia cru para o Prisma. Um preço como `"abc"` virava erro de `Decimal` e **500** em vez de 400. IDs como `1.5` também passavam pela checagem `!id`.
3. **Sem dono, sem autorização.** `Restaurant` não tinha `ownerId`; qualquer usuário autenticado cadastrava, editava e apagava pratos de **qualquer** restaurante.

### 4. Como a correção foi implementada
- `validateDish` valida nome, categoria, descrição (string, pode ser vazia) e preço (número finito, ≥ 0, normalizado com `toFixed(2)`); devolve **400** com mensagem clara.
- `parseId` só aceita inteiros positivos seguros (**400** caso contrário).
- O prato é criado com `imageUrl: ""` (o campo é obrigatório no schema) e a foto vem depois pela rota de upload.
- `Restaurant.ownerId` + `ensureOwnership`: só o dono altera o cardápio, caso contrário **403**. O dono vem do **token JWT**.
- `getDishWithRestaurant` carrega o prato junto com o restaurante para conferir o dono e devolve **404** se o prato não existir.

> ⚠️ **Atenção na migration:** `ownerId` é `NOT NULL` sem valor padrão. Se a tabela `Restaurant` já tem linhas, `prisma migrate dev` falha. Em ambiente de desenvolvimento, resolva com `npx prisma migrate reset` (apaga os dados) ou apague os restaurantes antigos antes.

---

## Partes 2, 3 e 4 — O que foi implementado

### Endpoints
| Método e rota | Proteção | Função |
|---|---|---|
| `POST /auth/me/image` | JWT | Foto do usuário **do token** (campo `image`) |
| `POST /dishes/:dishId/image` | JWT + dono do restaurante | Foto do prato (campo `image`) |
| `GET /auth/me` | JWT | Agora devolve `imageUrl` |
| `GET /restaurants/:id/dishes`, `GET /dishes/:id` | público | Já devolvem `imageUrl` do prato |
| `GET /uploads/...` | público | Serve as imagens para o navegador |

### Arquivos novos e alterados
```
prisma/schema.prisma                              + User.imageUrl String?
prisma/migrations/20261111120000_add_user_image/  + ALTER TABLE "User" ADD COLUMN "imageUrl" TEXT
src/modules/shared/image.service.js               NOVO  valida + otimiza (Sharp) + grava + remove
src/modules/shared/upload.middleware.js           NOVO  Multer (memória, 5 MB, JPEG/PNG/WebP) + erros HTTP
src/modules/auth/{routes,controller,service}      + rota, uploadImage, updateProfileImage
src/modules/dishes/{routes,controller,service}    + rota, uploadImage, updateDishImage
src/app.js                                        + express.static("/uploads")
tests/                                            NOVO  20 testes de integração
```

### Como o processamento funciona (`image.service.js`)
1. Lê o **conteúdo real** com Sharp (não confia no `Content-Type`): se não for imagem, **415**.
2. Aceita só JPEG, PNG ou WebP (um GIF rotulado como PNG também é recusado).
3. `rotate()` (orientação EXIF), `resize` (perfil 400×400 `cover`; prato até 1024×1024 `inside`, sem ampliar) e converte para **WebP** qualidade 80.
4. O nome do arquivo é **gerado no servidor** (`user-7-<uuid>.webp`); o nome enviado pelo cliente é ignorado (sem *path traversal*).
5. Se o processamento falhar: apaga arquivo parcial e responde **422**.
6. Se o `UPDATE` no banco falhar depois de gravar o arquivo: o arquivo é removido (compensação) e responde 500.
7. Ao trocar a imagem, a anterior é apagada (sem arquivos órfãos).

---

## Parte 5 — Testes

Resultado de `npm test` (20/20 passando):

| Teste pedido | Resultado esperado | Resultado |
|---|---|---|
| Cadastrar um prato | `201 Created` | ✅ |
| Enviar foto para o perfil autenticado | Imagem vinculada ao usuário | ✅ (WebP ≤ 400 px, caminho no banco) |
| Enviar foto para um prato | Imagem vinculada ao prato | ✅ (WebP ≤ 1024 px) |
| Consultar os dados atualizados | Caminho da imagem retornado | ✅ `/auth/me` e cardápio |
| Acessar a URL da imagem | Imagem exibida | ✅ `200 image/webp` |
| Enviar imagem sem JWT | `401 Unauthorized` | ✅ (perfil, prato e token falso) |
| Enviar arquivo inválido | Erro HTTP adequado | ✅ `415` (txt, GIF, GIF/EXE disfarçados de PNG) |
| Enviar imagem para prato inexistente | `404 Not Found` | ✅ |
| (extra) arquivo > 5 MB | erro adequado | ✅ `413` |
| (extra) sem arquivo | erro adequado | ✅ `400` |
| (extra) não é o dono do restaurante | proibido | ✅ `403` |
| (extra) foto do **token**, não de um id enviado | segurança | ✅ |

> **Limite honesto dos testes automatizados:** rodam com um **banco falso em memória** no lugar do PostgreSQL (`tests/helpers/fakePrisma.js`), porque dependem só do código da aplicação. Rotas, JWT, Multer, Sharp e o sistema de arquivos são reais. A integração com o PostgreSQL deve ser confirmada rodando a aplicação (roteiro abaixo).

Também fiz **teste de mutação**: removi de propósito o `authenticate` da rota, o `ensureOwnership` e a verificação de formato; os testes falharam em cada caso (o que levou a acrescentar o teste do GIF disfarçado).

### Roteiro manual (PostgreSQL real)
```bash
npm install
cp .env.example .env            # preencha DATABASE_URL e JWT_SECRET
npx prisma migrate dev          # (se falhar por ownerId: npx prisma migrate reset)
npx prisma generate
node server.js

# 1) cadastro + login
curl -s -X POST localhost:3000/auth/register -H "Content-Type: application/json" -d '{"name":"Sarah","email":"sarah@teste.com","password":"123456"}'
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"sarah@teste.com","password":"123456"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# 2) restaurante (vira dono) e prato  -> 201
curl -s -X POST localhost:3000/restaurants -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Pizzaria","category":"Pizza"}'
curl -s -X POST localhost:3000/restaurants/1/dishes -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Margherita","category":"Pizza","description":"Molho e muçarela","price":39.9}'

# 3) foto do perfil e do prato
curl -s -X POST localhost:3000/auth/me/image -H "Authorization: Bearer $TOKEN" -F "image=@foto.jpg"
curl -s -X POST localhost:3000/dishes/1/image -H "Authorization: Bearer $TOKEN" -F "image=@prato.jpg"

# 4) consultar e abrir no navegador
curl -s localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
curl -s localhost:3000/restaurants/1/dishes
#   abra http://localhost:3000/uploads/users/<arquivo>.webp

# 5) erros: sem token -> 401 ; arquivo .txt -> 415 ; prato 999 -> 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/auth/me/image -F "image=@foto.jpg"
```
No Postman: `Body → form-data`, chave `image` do tipo **File**, e `Authorization: Bearer <token>`.

---

## Parte 6 — Pense como arquiteto

**Por que reutilizar o mesmo serviço de imagens?** A regra "o que é uma imagem válida, como otimizar e onde guardar" é uma só. Duplicada em auth e dishes, qualquer ajuste (limite, formato, qualidade) teria de ser feito em dois lugares, com risco de divergir. Com `image.service.js`, perfil e prato diferem apenas pelo *preset* (`avatar` ou `dish`), e um terceiro módulo (logo do restaurante) reaproveita tudo.

**Controller × Service.** O *controller* conhece HTTP: lê `req`, chama o service e converte o resultado ou erro em status e JSON. O *service* conhece o negócio: valida regras, decide quem pode, fala com o banco e com o `image.service`, e não sabe que existe `req`/`res`. Assim o mesmo service poderia ser chamado por uma fila ou por uma função serverless.

**Por que não processar na rota?** Rota que mistura Sharp, disco e SQL fica impossível de testar isolada, de reutilizar e de trocar (ex.: S3 no lugar do disco). A rota só declara a cadeia: autenticar → receber arquivo → controller.

**Como o middleware de autenticação protege a foto de perfil?** `authenticate` valida a assinatura do JWT e coloca o `id` do usuário em `req.user`. O service usa **esse** id; a rota não aceita `userId` do cliente (há teste enviando outro `userId` no corpo, que é ignorado). Sem token válido, nada é processado nem gravado (**401**, e o `authenticate` roda *antes* do upload).

**Se o processamento falhar?** Arquivo que não é imagem: **415**. Imagem que o Sharp não consegue processar: **422**, sem arquivo parcial. Falha no banco depois de gravar: o arquivo é removido e a API responde 500 genérico, sem vazar detalhes. O registro anterior continua intacto.

**A arquitetura permite novas funcionalidades sem mexer em tudo?** Sim, nos limites atuais: novo recurso com imagem = nova rota + chamada ao `image.service` + (se preciso) um novo preset. Pontos fracos conhecidos: o armazenamento é o disco local (não escala para várias instâncias; ver ADR-003) e o processamento acontece dentro da requisição.
