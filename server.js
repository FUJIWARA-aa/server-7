import { Hono } from "jsr:@hono/hono";
import { serveStatic } from "jsr:@hono/hono/deno";
const app = new Hono();

app.use("/*", serveStatic({ root: "./public" }));

// データベースの準備
const kv = await Deno.openKv();

async function getNextId() {
  const key = ["counter", "pokemons"];
  const res = await kv.atomic().sum(key, 1n).commit();
  if (!res.ok) {
    console.error("IDの生成に失敗しました。");
    return null;
  }
  const counter = await kv.get(key);
  return Number(counter.value);
}

/***  リソースの作成 ***/
app.post("/api/pokemons", async (c) => {
  const body = await c.req.parseBody();
  const record = JSON.parse(body["record"]);
  const id = await getNextId();
  record.id = id;
  record["created_at"] = new Date().toISOString();
  await kv.set(["pokemons", id], record);
  await kv.get(["pokemons", id]);
  c.status(201);
  c.header("Location", `/api/pokemons/${id}`);
  return c.json({ record });
});

/*** リソースの取得（レコード単体） ***/
app.get("/api/pokemons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const pkmn = await kv.get(["pokemons", id]);
  if (pkmn.value) {
    return c.json(pkmn.value);
  } else {
    c.status(404);
    return c.json({ message: "Not Found" });
  }
});

/*** リソースの取得（コレクション） ***/
app.get("/api/pokemons", async (c) => {
  const pkmns = await kv.list({ prefix: ["pokemons"] });
  const pkmnList = await Array.fromAsync(pkmns);
  if (pkmnList.length > 0) {
    return c.json(pkmnList.map((e) => e.value));
  } else {
    c.status(404);
    return c.json({ message: "Not Found" });
  }
});

/*** リソースの更新 ***/
app.put("/api/pokemons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || !Number.isInteger(id)) {
    c.status(400);
    return c.json({ message: "Bad Request" });
  }
  const pkmns = await kv.list({ prefit: ["pokemons"] });
  let exists = false;
  for await (const pkmn of pkmns) {
    if (pkmn.value.id[1] === id) {
      exists = true;
      break;
    }
  }
  if (exists) {
    const body = await c.req.parseBody();
    const record = JSON.parse(body["record"]);
    await kv.set(["pokemons", id], record);
    c.status(204);
    return c.body(null);
  } else {
    c.status(404);
    return c.json({ message: "Not Found" });
  }
});

/*** リソースの削除 ***/
app.delete("/api/pokemons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || !Number.isInteger(id)) {
    c.status(400);
    return c.json({ message: "Bad Request" });
  }
  const pkmns = await kv.list({ prefix: ["pokemons"] });
  let exists = false;
  for await (const pkmn of pkmns) {
    if (pkmn.value.id === id) {
      exists = true;
      break;
    }
  }
  if (exists) {
    await kv.delete(["pokemons", id]);
    c.status(204);
    return c.body(null);
  } else {
    c.status(404);
    return c.json({ message: "Not Found" });
  }
});

/*** リソースをすべて削除（練習用） ***/
app.delete("/api/pokemons", async (c) => {
  const deleteList = await kv.list({ prefix: ["pokemons"] });
  const atomic = kv.atomic();
  for await (const item of deleteList) atomic.delete(item.key);
  const result = await atomic.commit();
  if (result.ok) {
    await kv.delete(["counter", "pokemons"]);
    c.status(204);
    return c.body(null);
  } else {
    c.status(503);
    return c.json({ message: "Internal Server Error" });
  }
});

Deno.serve(app.fetch);
