// Thin wrapper around the PixelProse REST API. Every call throws an Error with a readable message.

function describe(detail, status) {
  if (!detail) return `Request failed (${status})`;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail.map((d) => `${(d.loc || []).slice(-1)[0] ?? "input"}: ${d.msg}`).join("; ");
  }
  return JSON.stringify(detail);
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Cannot reach the PixelProse server. Is it still running?");
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const error = new Error(describe(data.detail, res.status));
    error.status = res.status;
    throw error;
  }
  return data;
}

const postJSON = (path, body) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => request("/api/health"),
  samples: () => request("/api/samples"),

  /** @param {Blob|null} file  @param {object} fields  form fields (url, image_id, model, strategy, ...) */
  caption(file, fields = {}) {
    const form = new FormData();
    if (file) form.append("file", file, file.name || "image.jpg");
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
    }
    return request("/api/caption", { method: "POST", body: form });
  },

  upload(file) {
    const form = new FormData();
    form.append("file", file, file.name || "image.jpg");
    return request("/api/upload", { method: "POST", body: form });
  },

  explain: (imageId, text) => postJSON("/api/explain", { image_id: imageId, text }),
  ask: (imageId, question) => postJSON("/api/vqa", { image_id: imageId, question }),
  match: (imageId, texts) => postJSON("/api/match", { image_id: imageId, texts }),
};
