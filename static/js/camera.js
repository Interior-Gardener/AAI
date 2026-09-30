// Webcam capture (works on localhost or HTTPS).

let stream = null;
let facing = "user";

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera is not available in this browser.");
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false });
  } catch (err) {
    throw new Error(err.name === "NotAllowedError" ? "Camera permission was denied." : "Could not start the camera.");
  }
  video.srcObject = stream;
  video.classList.toggle("rear", facing === "environment");
  await video.play();
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function flipCamera(video) {
  facing = facing === "user" ? "environment" : "user";
  await startCamera(video).catch(() => {});
}

export function capturePhoto(video) {
  if (!stream || !video.videoWidth) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (facing === "user") {
    // Un-mirror so the saved photo matches what the user saw.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}
