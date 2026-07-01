import { exec } from "child_process";

export async function convertImage(req, res) {
  const name = req.body.filename;
  exec(`convert uploads/${name} -resize 200x200 thumbs/${name}`, (err) => {
    if (err) return res.status(500).end();
    res.json({ ok: true });
  });
}
