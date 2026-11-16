// Banco falso em memória, com a mesma interface mínima do Prisma usada pelo projeto.
// Existe só para os testes automatizados rodarem sem PostgreSQL.
function createFakePrisma() {
  const db = { users: [], restaurants: [], dishes: [], activities: [] };
  let seq = { user: 1, restaurant: 1, dish: 1, activity: 1 };

  const pick = (list, where) => list.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null;
  const notFound = () => Object.assign(new Error("Record not found"), { code: "P2025" });

  return {
    _db: db,
    user: {
      async create({ data }) {
        if (db.users.some((u) => u.email === data.email)) throw Object.assign(new Error("Unique"), { code: "P2002" });
        const u = { id: seq.user++, imageUrl: null, ...data };
        db.users.push(u);
        return { ...u };
      },
      async findUnique({ where }) {
        const u = pick(db.users, where);
        return u ? { ...u } : null;
      },
      async update({ where, data }) {
        const u = pick(db.users, where);
        if (!u) throw notFound();
        Object.assign(u, data);
        return { ...u };
      }
    },
    restaurant: {
      async create({ data }) {
        const r = { id: seq.restaurant++, ...data };
        db.restaurants.push(r);
        return { ...r };
      },
      async findUnique({ where }) {
        const r = pick(db.restaurants, where);
        return r ? { ...r } : null;
      },
      async findMany() {
        return db.restaurants.map((r) => ({ ...r }));
      }
    },
    dish: {
      async create({ data }) {
        const d = { id: seq.dish++, ...data };
        db.dishes.push(d);
        return { ...d };
      },
      async findUnique({ where, include }) {
        const d = pick(db.dishes, where);
        if (!d) return null;
        return include?.restaurant ? { ...d, restaurant: pick(db.restaurants, { id: d.restaurantId }) } : { ...d };
      },
      async findMany({ where }) {
        return db.dishes.filter((d) => d.restaurantId === where.restaurantId).map((d) => ({ ...d }));
      },
      async update({ where, data }) {
        const d = pick(db.dishes, where);
        if (!d) throw notFound();
        Object.assign(d, data);
        return { ...d };
      },
      async delete({ where }) {
        db.dishes = db.dishes.filter((d) => d.id !== where.id);
      }
    },
    activity: {
      async create({ data }) {
        const a = { id: seq.activity++, ...data };
        db.activities.push(a);
        return a;
      }
    }
  };
}

module.exports = { createFakePrisma };
