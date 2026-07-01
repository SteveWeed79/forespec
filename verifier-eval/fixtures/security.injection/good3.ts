import { execFile } from "child_process";

export async function convertImage(req, res) {
  const name = req.body.filename;
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg)$/.test(name)) return res.status(400).end();
  execFile("convert", [`uploads/${name}`, "-resize", "200x200", `thumbs/${name}`], (err) => {
    if (err) return res.status(500).end();
    res.json({ ok: true });
  });
}
