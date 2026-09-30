// Renders a shareable 1080×1350 PNG: the image, its caption and the model's scores.

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(ctx, x, y, label, value, color) {
  ctx.font = "600 26px Inter, sans-serif";
  const text = `${label}  ${value}`;
  const w = ctx.measureText(text).width + 44;
  roundRect(ctx, x, y, w, 52, 26);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + 22, y + 35);
  return w;
}

export async function renderShareCard(img, result) {
  await document.fonts?.ready;
  const W = 1080, H = 1350, pad = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#120d2a");
  bg.addColorStop(1, "#07070d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 700);
  glow.addColorStop(0, "rgba(139,92,246,.45)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Image, "cover" fit inside a rounded frame
  const box = { x: pad, y: pad, w: W - pad * 2, h: 760 };
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const sw = box.w / scale, sh = box.h / scale;
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 36);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
  ctx.restore();

  // Caption
  let y = box.y + box.h + 80;
  const grad = ctx.createLinearGradient(pad, 0, W - pad, 0);
  grad.addColorStop(0, "#a78bfa");
  grad.addColorStop(1, "#22d3ee");
  ctx.fillStyle = grad;
  ctx.font = "700 24px 'JetBrains Mono', monospace";
  ctx.fillText("AI CAPTION", pad, y);
  y += 64;
  ctx.fillStyle = "#f4f3ff";
  let size = 54;
  let lines;
  do {
    ctx.font = `600 ${size}px 'Space Grotesk', Inter, sans-serif`;
    lines = wrapLines(ctx, result.sentence, W - pad * 2);
    size -= 4;
  } while (lines.length > 3 && size > 30);
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += size * 1.3;
  }

  // Scores + brand
  const py = H - pad - 52;
  let x = pad;
  x += pill(ctx, x, py, "Confidence", `${Math.round(result.confidence * 100)}%`, "#8b5cf6") + 14;
  if (result.match !== null && result.match !== undefined) pill(ctx, x, py, "Image match", `${(result.match * 100).toFixed(1)}%`, "#22d3ee");
  ctx.font = "700 30px 'Space Grotesk', sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.fillText("PixelProse", W - pad, py + 36);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
