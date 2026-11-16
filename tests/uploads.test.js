// Testes de integração das Atividade 8: cadastro de prato + upload de imagens (perfil e prato).
// Rodam com `npm test`. Usam um banco falso em memória (sem PostgreSQL) e uma pasta temporária de uploads.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const sharp = require("sharp");

// --- ambiente de teste (antes de carregar o app) ---
process.env.JWT_SECRET = "segredo-de-teste";
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "easyfood-uploads-"));

const { createFakePrisma } = require("./helpers/fakePrisma");
const fake = createFakePrisma();
const prismaPath = require.resolve("../src/database/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fake };

const app = require("../src/app");
const imageService = require("../src/modules/shared/image.service");

// --- utilitários ---
const png = (w = 1600, h = 1200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
const jpeg = () => sharp({ create: { width: 900, height: 600, channels: 3, background: "#336699" } }).jpeg().toBuffer();
const webp = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#228833" } }).webp().toBuffer();
const gif = () => sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).gif().toBuffer();
const fileOnDisk = (publicPath) => path.join(imageService.UPLOADS_ROOT, publicPath.slice("/uploads/".length));

async function signup(name) {
  const email = `${name.toLowerCase()}@teste.com`;
  await request(app).post("/auth/register").send({ name, email, password: "123456" }).expect(201);
  const login = await request(app).post("/auth/login").send({ email, password: "123456" }).expect(200);
  return { token: login.body.token, id: login.body.user.id };
}

let dono, outro, restaurant, dish;

before(async () => {
  dono = await signup("Dono");
  outro = await signup("Outro");
  restaurant = await fake.restaurant.create({ data: { name: "Pizzaria", category: "Pizza", rating: 4.5, ownerId: dono.id } });
});
after(() => fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true }));

// ---------------- Parte 1: cadastro de prato ----------------
test("Cadastrar um prato -> 201 Created, associado ao restaurante", async () => {
  const res = await request(app)
    .post(`/restaurants/${restaurant.id}/dishes`)
    .set("Authorization", `Bearer ${dono.token}`)
    .send({ name: "Margherita", category: "Pizza", description: "Molho, muçarela e manjericão", price: 39.9 });
  assert.equal(res.status, 201);
  assert.equal(res.body.restaurantId, restaurant.id);
  assert.equal(res.body.imageUrl, "", "o prato nasce sem imagem; a foto é enviada depois");
  dish = res.body;
});

test("Cadastro de prato sem imageUrl no corpo funciona (era a exigência que quebrava)", async () => {
  const res = await request(app)
    .post(`/restaurants/${restaurant.id}/dishes`)
    .set("Authorization", `Bearer ${dono.token}`)
    .send({ name: "Calabresa", category: "Pizza", description: "", price: "42.50" });
  assert.equal(res.status, 201);
});

test("Cadastro de prato por quem NÃO é o dono -> 403", async () => {
  const res = await request(app)
    .post(`/restaurants/${restaurant.id}/dishes`)
    .set("Authorization", `Bearer ${outro.token}`)
    .send({ name: "X", category: "Y", description: "", price: 1 });
  assert.equal(res.status, 403);
});

// ---------------- Parte 2: imagem do perfil ----------------
let perfilUrl;
test("Enviar foto para o perfil autenticado -> imagem vinculada ao usuário, otimizada (WebP ≤ 400px)", async () => {
  const res = await request(app)
    .post("/auth/me/image")
    .set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(), { filename: "minha foto.png", contentType: "image/png" });
  assert.equal(res.status, 200);
  perfilUrl = res.body.user.imageUrl;
  assert.match(perfilUrl, /^\/uploads\/users\/user-\d+-[0-9a-f-]{36}\.webp$/);
  const meta = await sharp(fileOnDisk(perfilUrl)).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width <= 400 && meta.height <= 400);
  assert.equal(fake._db.users.find((u) => u.id === dono.id).imageUrl, perfilUrl, "caminho gravado no banco");
});

test("Consultar os dados atualizados: GET /auth/me devolve o caminho da imagem", async () => {
  const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${dono.token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.imageUrl, perfilUrl);
});

test("Acessar a URL da imagem -> imagem exibida (200, image/webp)", async () => {
  const res = await request(app).get(perfilUrl).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on("data", (c) => chunks.push(c));
    r.on("end", () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "image/webp");
  assert.equal((await sharp(res.body).metadata()).format, "webp");
});

test("A foto é do usuário DO TOKEN: outro usuário não altera a foto do dono", async () => {
  await request(app).post("/auth/me/image").set("Authorization", `Bearer ${outro.token}`)
    .field("userId", String(dono.id)) // tentativa de indicar outro usuário: é ignorada
    .attach("image", await jpeg(), { filename: "a.jpg", contentType: "image/jpeg" }).expect(200);
  assert.equal(fake._db.users.find((u) => u.id === dono.id).imageUrl, perfilUrl);
  assert.ok(fake._db.users.find((u) => u.id === outro.id).imageUrl);
});

test("Trocar a foto apaga a anterior (sem arquivos órfãos) e aceita WebP", async () => {
  const antes = fileOnDisk(perfilUrl);
  assert.ok(fs.existsSync(antes));
  const res = await request(app).post("/auth/me/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await webp(), { filename: "n.webp", contentType: "image/webp" });
  assert.equal(res.status, 200);
  assert.notEqual(res.body.user.imageUrl, perfilUrl);
  assert.ok(!fs.existsSync(antes), "arquivo antigo removido");
  perfilUrl = res.body.user.imageUrl;
});

// ---------------- Parte 3: imagem do prato ----------------
test("Enviar foto para um prato -> imagem vinculada ao prato (WebP ≤ 1024px) e devolvida no cardápio", async () => {
  const res = await request(app).post(`/dishes/${dish.id}/image`).set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(3000, 2000), { filename: "prato.png", contentType: "image/png" });
  assert.equal(res.status, 200);
  assert.match(res.body.imageUrl, /^\/uploads\/dishes\/dish-\d+-[0-9a-f-]{36}\.webp$/);
  const meta = await sharp(fileOnDisk(res.body.imageUrl)).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(Math.max(meta.width, meta.height) <= 1024);

  const menu = await request(app).get(`/restaurants/${restaurant.id}/dishes`);
  assert.equal(menu.status, 200);
  assert.equal(menu.body.find((d) => d.id === dish.id).imageUrl, res.body.imageUrl);
});

test("Prato: quem não é dono do restaurante -> 403 e nada é gravado em disco", async () => {
  const antes = fs.readdirSync(path.join(imageService.UPLOADS_ROOT, "dishes")).length;
  const res = await request(app).post(`/dishes/${dish.id}/image`).set("Authorization", `Bearer ${outro.token}`)
    .attach("image", await png(), { filename: "p.png", contentType: "image/png" });
  assert.equal(res.status, 403);
  assert.equal(fs.readdirSync(path.join(imageService.UPLOADS_ROOT, "dishes")).length, antes);
});

test("Enviar imagem para prato inexistente -> 404 Not Found", async () => {
  const res = await request(app).post("/dishes/99999/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(), { filename: "p.png", contentType: "image/png" });
  assert.equal(res.status, 404);
});

test("Identificador de prato inválido -> 400", async () => {
  const res = await request(app).post("/dishes/abc/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(), { filename: "p.png", contentType: "image/png" });
  assert.equal(res.status, 400);
});

// ---------------- Segurança e validação ----------------
test("Enviar imagem sem JWT -> 401 Unauthorized (perfil e prato)", async () => {
  const buf = await png();
  await request(app).post("/auth/me/image").attach("image", buf, { filename: "a.png", contentType: "image/png" }).expect(401);
  await request(app).post(`/dishes/${dish.id}/image`).attach("image", buf, { filename: "a.png", contentType: "image/png" }).expect(401);
  await request(app).post("/auth/me/image").set("Authorization", "Bearer token-falso")
    .attach("image", buf, { filename: "a.png", contentType: "image/png" }).expect(401);
});

test("Arquivo inválido -> 415 (tipo declarado inválido, GIF, e texto disfarçado de PNG)", async () => {
  const h = { Authorization: `Bearer ${dono.token}` };
  const txt = await request(app).post("/auth/me/image").set(h)
    .attach("image", Buffer.from("isto não é imagem"), { filename: "a.txt", contentType: "text/plain" });
  assert.equal(txt.status, 415);
  const gifRes = await request(app).post("/auth/me/image").set(h)
    .attach("image", await gif(), { filename: "a.gif", contentType: "image/gif" });
  assert.equal(gifRes.status, 415);
  const fake_png = await request(app).post(`/dishes/${dish.id}/image`).set(h)
    .attach("image", Buffer.from("MZ executavel disfarcado"), { filename: "a.png", contentType: "image/png" });
  assert.equal(fake_png.status, 415, "o conteúdo é verificado, não só o Content-Type");
});

test("GIF de verdade enviado como 'image/png' -> 415 (formato real é verificado pelo conteúdo)", async () => {
  const res = await request(app).post("/auth/me/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await gif(), { filename: "disfarce.png", contentType: "image/png" });
  assert.equal(res.status, 415);
});

test("Arquivo acima do limite de 5 MB -> 413", async () => {
  const res = await request(app).post("/auth/me/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", Buffer.alloc(6 * 1024 * 1024), { filename: "grande.png", contentType: "image/png" });
  assert.equal(res.status, 413);
});

test("Requisição sem arquivo -> 400", async () => {
  const res = await request(app).post("/auth/me/image").set("Authorization", `Bearer ${dono.token}`).field("x", "y");
  assert.equal(res.status, 400);
});

test("Nome de arquivo malicioso é ignorado: o servidor gera o nome (sem path traversal)", async () => {
  const res = await request(app).post("/auth/me/image").set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(), { filename: "../../../etc/passwd.png", contentType: "image/png" });
  assert.equal(res.status, 200);
  assert.ok(fileOnDisk(res.body.user.imageUrl).startsWith(imageService.UPLOADS_ROOT));
});

// ---------------- Parte 4: reutilização ----------------
test("Perfil e prato usam o MESMO serviço de imagens (image.service)", () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", "src", "modules", f), "utf8");
  assert.match(src("auth/auth.service.js"), /require\("\.\.\/shared\/image\.service"\)/);
  assert.match(src("dishes/dish.service.js"), /require\("\.\.\/shared\/image\.service"\)/);
  assert.doesNotMatch(src("auth/auth.service.js") + src("dishes/dish.service.js"), /require\("sharp"\)/, "sharp só existe no serviço compartilhado");
});

test("Falha no banco após o processamento: o arquivo gravado é removido (compensação)", async () => {
  const original = fake.dish.update;
  fake.dish.update = async () => { throw new Error("banco indisponível"); };
  const antes = fs.readdirSync(path.join(imageService.UPLOADS_ROOT, "dishes")).sort();
  const res = await request(app).post(`/dishes/${dish.id}/image`).set("Authorization", `Bearer ${dono.token}`)
    .attach("image", await png(), { filename: "p.png", contentType: "image/png" });
  fake.dish.update = original;
  assert.equal(res.status, 500);
  assert.deepEqual(fs.readdirSync(path.join(imageService.UPLOADS_ROOT, "dishes")).sort(), antes);
});
