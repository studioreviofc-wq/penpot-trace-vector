// Código que roda dentro do Penpot (tem acesso ao objeto `penpot`).
// Para testar localmente, troque por "http://localhost:4406/index.html".
const UI_URL = "https://studioreviofc-wq.github.io/penpot-trace-vector/index.html";
penpot.ui.open("Trace Vector", `${UI_URL}?theme=${penpot.theme}`, { width: 320, height: 800 });

const GAP = 40;

function fillsOf(shape) {
  return Array.isArray(shape.fills) ? shape.fills : [];
}

function imageFill(shape) {
  const f = fillsOf(shape).find((x) => x && x.fillImage);
  return f ? f.fillImage : null;
}

function selectionInfo() {
  return penpot.selection.map((s) => {
    const img = imageFill(s);
    return {
      id: s.id,
      name: s.name,
      width: Math.round(s.width),
      height: Math.round(s.height),
      image: !!img,
    };
  });
}

function findShape(id) {
  return penpot.selection.find((s) => s.id === id) ||
    (penpot.currentPage ? penpot.currentPage.getShapeById(id) : null);
}

function reply(reqId, data) { penpot.ui.sendMessage({ type: "reply", reqId, ...data }); }

// Usa a imagem original do preenchimento (resolução máxima). Se a camada não tiver
// imagem (grupo, ilustração, etc.), exporta a camada como PNG.
async function getImage(shapeId) {
  const shape = findShape(shapeId);
  if (!shape) throw new Error("NOT_FOUND");
  const img = imageFill(shape);
  if (img) return { bytes: await img.data(), mtype: img.mtype || "image/png" };
  const scale = Math.max(1, Math.min(4, 1600 / Math.max(shape.width, shape.height, 1)));
  return { bytes: await shape.export({ type: "png", scale }), mtype: "image/png" };
}

function insertSvg(shapeId, svg, placement, name) {
  const shape = findShape(shapeId);
  if (!shape) throw new Error("NOT_FOUND");
  if (typeof penpot.createShapeFromSvg !== "function") throw new Error("NO_SVG_API");
  const group = penpot.createShapeFromSvg(svg);
  if (!group) throw new Error("SVG_FAILED");
  group.name = name;

  // Coloca o vetor no mesmo nível da camada original, logo acima dela.
  const parent = shape.parent;
  if (parent && typeof parent.insertChild === "function") {
    try { parent.insertChild(shape.parentIndex + 1, group); } catch (e) { /* fica na raiz */ }
  }

  // Mantém a proporção do vetor e encaixa no tamanho da camada original.
  const s = Math.min(shape.width / group.width, shape.height / group.height);
  if (isFinite(s) && Math.abs(s - 1) > 0.001 && typeof group.resize === "function") {
    group.resize(group.width * s, group.height * s);
  }
  const offX = (shape.width - group.width) / 2;
  const offY = (shape.height - group.height) / 2;
  group.x = placement === "over" ? shape.x + offX : shape.x + shape.width + GAP + offX;
  group.y = shape.y + offY;
  if (placement === "over") shape.hidden = true;
  return group;
}

penpot.ui.onMessage(async (msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "ready") {
    penpot.ui.sendMessage({ type: "theme", theme: penpot.theme });
    penpot.ui.sendMessage({ type: "selection", shapes: selectionInfo() });
    return;
  }

  const { reqId } = msg;
  try {
    if (msg.type === "get-image") {
      reply(reqId, await getImage(msg.shapeId));
    } else if (msg.type === "insert-svg") {
      const group = insertSvg(msg.shapeId, msg.svg, msg.placement, msg.name);
      reply(reqId, { id: group.id });
    } else if (msg.type === "select") {
      const shapes = (msg.ids || []).map((id) => penpot.currentPage.getShapeById(id)).filter(Boolean);
      try { if (shapes.length) penpot.selection = shapes; } catch (e) { /* opcional */ }
      reply(reqId, { ok: true });
    }
  } catch (err) {
    reply(reqId, { error: String((err && err.message) || err) });
  }
});

penpot.on("selectionchange", () => {
  penpot.ui.sendMessage({ type: "selection", shapes: selectionInfo() });
});

penpot.on("themechange", (theme) => {
  penpot.ui.sendMessage({ type: "theme", theme });
});
